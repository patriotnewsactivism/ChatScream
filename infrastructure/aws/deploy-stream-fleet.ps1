param(
  [string]$ConfigFile = "$PSScriptRoot\.env.aws",
  [string]$UserDataFile = "$PSScriptRoot\scripts\ec2-user-data.sh"
)

$ErrorActionPreference = 'Stop'

function Get-ConfigMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }
    $parts = $trimmed.Split('=', 2)
    if ($parts.Count -ne 2) {
      continue
    }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    $map[$key] = $value
  }

  return $map
}

function Get-Value {
  param(
    [hashtable]$Config,
    [string]$Name,
    [string]$Default = ''
  )

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if ($envValue) {
    return $envValue
  }
  if ($Config.ContainsKey($Name) -and $Config[$Name]) {
    return $Config[$Name]
  }
  return $Default
}

function Ensure-AwsCli {
  $aws = Get-Command aws -ErrorAction SilentlyContinue
  if (-not $aws) {
    throw 'aws CLI is required and was not found in PATH.'
  }
}

function Invoke-AwsJson {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  $json = & aws @Args --output json
  if (-not $json) {
    return $null
  }
  return $json | ConvertFrom-Json
}

function New-TempJsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,
    [int]$Depth = 10
  )
  $tempPath = Join-Path $env:TEMP ("chatscream-" + [Guid]::NewGuid().ToString('N') + ".json")
  $json = $Value | ConvertTo-Json -Depth $Depth
  Set-Content -Path $tempPath -Value $json -Encoding ascii
  return $tempPath
}

Ensure-AwsCli

if (-not (Test-Path $UserDataFile)) {
  throw "User data file not found: $UserDataFile"
}

$config = Get-ConfigMap -Path $ConfigFile

$AwsRegion = Get-Value -Config $config -Name 'AWS_REGION' -Default 'us-east-1'
$VpcId = Get-Value -Config $config -Name 'VPC_ID'
$SubnetIds = Get-Value -Config $config -Name 'SUBNET_IDS'
$LaunchTemplateName = Get-Value -Config $config -Name 'LAUNCH_TEMPLATE_NAME' -Default 'chatscream-ffmpeg-lt'
$AsgName = Get-Value -Config $config -Name 'ASG_NAME' -Default 'chatscream-ffmpeg-asg'
$SecurityGroupName = Get-Value -Config $config -Name 'SECURITY_GROUP_NAME' -Default 'chatscream-ffmpeg-sg'
$SecurityGroupId = Get-Value -Config $config -Name 'SECURITY_GROUP_ID'
$InstanceType = Get-Value -Config $config -Name 'INSTANCE_TYPE' -Default 'c7g.large'
$InstanceProfileName = Get-Value -Config $config -Name 'INSTANCE_PROFILE_NAME'
$AmiId = Get-Value -Config $config -Name 'AMI_ID'
$MinSize = [int](Get-Value -Config $config -Name 'MIN_SIZE' -Default '0')
$DesiredCapacity = [int](Get-Value -Config $config -Name 'DESIRED_CAPACITY' -Default '0')
$MaxSize = [int](Get-Value -Config $config -Name 'MAX_SIZE' -Default '20')
$TargetCpuPercent = [double](Get-Value -Config $config -Name 'TARGET_CPU_PERCENT' -Default '55')

if (-not $VpcId) {
  throw 'VPC_ID is required. Set it in infrastructure/aws/.env.aws'
}
if (-not $SubnetIds) {
  throw 'SUBNET_IDS is required. Set it in infrastructure/aws/.env.aws'
}

if (-not $AmiId) {
  $isArm = $InstanceType.StartsWith('c7g') -or $InstanceType.StartsWith('t4g')
  $amiParams = if ($isArm) {
    @(
      '/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp3/ami-id',
      '/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id'
    )
  } else {
    @(
      '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
      '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id'
    )
  }

  foreach ($amiParam in $amiParams) {
    try {
      $candidate = (& aws ssm get-parameter --region $AwsRegion --name $amiParam --query 'Parameter.Value' --output text 2>$null).Trim()
      if ($candidate -and $candidate -ne 'None') {
        $AmiId = $candidate
        break
      }
    } catch {
      continue
    }
  }

  if (-not $AmiId) {
    throw "Could not resolve AMI_ID from SSM for instance type $InstanceType in $AwsRegion."
  }
}

if (-not $SecurityGroupId) {
  $sgQuery = (& aws ec2 describe-security-groups `
    --region $AwsRegion `
    --filters "Name=group-name,Values=$SecurityGroupName" "Name=vpc-id,Values=$VpcId" `
    --query 'SecurityGroups[0].GroupId' `
    --output text).Trim()
  if ($sgQuery -and $sgQuery -ne 'None') {
    $SecurityGroupId = $sgQuery
  }
}

if (-not $SecurityGroupId) {
  $SecurityGroupId = (& aws ec2 create-security-group `
    --region $AwsRegion `
    --group-name $SecurityGroupName `
    --description 'ChatScream FFmpeg stream workers' `
    --vpc-id $VpcId `
    --query 'GroupId' `
    --output text).Trim()

  foreach ($port in @(22, 80, 1935)) {
    & aws ec2 authorize-security-group-ingress `
      --region $AwsRegion `
      --group-id $SecurityGroupId `
      --protocol tcp `
      --port $port `
      --cidr 0.0.0.0/0 2>$null | Out-Null
  }
}

$userDataBytes = [System.IO.File]::ReadAllBytes($UserDataFile)
$userDataB64 = [System.Convert]::ToBase64String($userDataBytes)

$launchTemplateData = @{
  ImageId = $AmiId
  InstanceType = $InstanceType
  SecurityGroupIds = @($SecurityGroupId)
  UserData = $userDataB64
  MetadataOptions = @{ HttpEndpoint = 'enabled'; HttpTokens = 'required' }
  BlockDeviceMappings = @(
    @{
      DeviceName = '/dev/sda1'
      Ebs = @{
        DeleteOnTermination = $true
        Encrypted = $true
        VolumeType = 'gp3'
        VolumeSize = 40
      }
    }
  )
  TagSpecifications = @(
    @{
      ResourceType = 'instance'
      Tags = @(
        @{ Key = 'Name'; Value = 'chatscream-ffmpeg-worker' },
        @{ Key = 'Service'; Value = 'chatscream-streaming' }
      )
    }
  )
}

if ($InstanceProfileName) {
  $launchTemplateData.IamInstanceProfile = @{ Name = $InstanceProfileName }
}

$launchTemplateDataFile = New-TempJsonFile -Value $launchTemplateData -Depth 10
$launchTemplateDataArg = "file://$($launchTemplateDataFile.Replace('\', '/'))"

$ltNameCheck = ''
try {
  $ltNameCheck = (& aws ec2 describe-launch-templates `
    --region $AwsRegion `
    --launch-template-names $LaunchTemplateName `
    --query 'LaunchTemplates[0].LaunchTemplateName' `
    --output text 2>$null).Trim()
} catch {
  $ltNameCheck = ''
}

if ($ltNameCheck -eq $LaunchTemplateName) {
  $versionStamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
  & aws ec2 create-launch-template-version `
    --region $AwsRegion `
    --launch-template-name $LaunchTemplateName `
    --source-version '$Latest' `
    --version-description ("updated-" + $versionStamp) `
    --launch-template-data $launchTemplateDataArg | Out-Null
} else {
  & aws ec2 create-launch-template `
    --region $AwsRegion `
    --launch-template-name $LaunchTemplateName `
    --version-description 'initial' `
    --launch-template-data $launchTemplateDataArg | Out-Null
}

$latestLtVersion = (& aws ec2 describe-launch-templates `
  --region $AwsRegion `
  --launch-template-names $LaunchTemplateName `
  --query 'LaunchTemplates[0].LatestVersionNumber' `
  --output text).Trim()

& aws ec2 modify-launch-template `
  --region $AwsRegion `
  --launch-template-name $LaunchTemplateName `
  --default-version $latestLtVersion | Out-Null

$asgNameCheck = ''
try {
  $asgNameCheck = (& aws autoscaling describe-auto-scaling-groups `
    --region $AwsRegion `
    --auto-scaling-group-names $AsgName `
    --query 'AutoScalingGroups[0].AutoScalingGroupName' `
    --output text 2>$null).Trim()
} catch {
  $asgNameCheck = ''
}

$launchTemplateRef = "LaunchTemplateName=$LaunchTemplateName,Version=$latestLtVersion"

if ($asgNameCheck -eq $AsgName) {
  & aws autoscaling update-auto-scaling-group `
    --region $AwsRegion `
    --auto-scaling-group-name $AsgName `
    --launch-template $launchTemplateRef `
    --min-size $MinSize `
    --desired-capacity $DesiredCapacity `
    --max-size $MaxSize `
    --vpc-zone-identifier $SubnetIds | Out-Null
} else {
  & aws autoscaling create-auto-scaling-group `
    --region $AwsRegion `
    --auto-scaling-group-name $AsgName `
    --launch-template $launchTemplateRef `
    --min-size $MinSize `
    --desired-capacity $DesiredCapacity `
    --max-size $MaxSize `
    --vpc-zone-identifier $SubnetIds `
    --health-check-type EC2 `
    --health-check-grace-period 300 `
    --tags "Key=Name,Value=chatscream-ffmpeg-worker,PropagateAtLaunch=true" `
           "Key=Service,Value=chatscream-streaming,PropagateAtLaunch=true" | Out-Null
}

$targetTracking = @{
  TargetValue = $TargetCpuPercent
  DisableScaleIn = $false
  PredefinedMetricSpecification = @{
    PredefinedMetricType = 'ASGAverageCPUUtilization'
  }
}
$targetTrackingFile = New-TempJsonFile -Value $targetTracking -Depth 5
$targetTrackingArg = "file://$($targetTrackingFile.Replace('\', '/'))"

& aws autoscaling put-scaling-policy `
  --region $AwsRegion `
  --auto-scaling-group-name $AsgName `
  --policy-name "$AsgName-cpu-target" `
  --policy-type TargetTrackingScaling `
  --target-tracking-configuration $targetTrackingArg | Out-Null

if (Test-Path $launchTemplateDataFile) {
  Remove-Item $launchTemplateDataFile -Force
}
if (Test-Path $targetTrackingFile) {
  Remove-Item $targetTrackingFile -Force
}

Write-Host ''
Write-Host 'ChatScream stream fleet deployed.'
Write-Host "Region:               $AwsRegion"
Write-Host "Launch template:      $LaunchTemplateName (v$latestLtVersion)"
Write-Host "Auto Scaling Group:   $AsgName"
Write-Host "Security Group:       $SecurityGroupId"
Write-Host "Instance type:        $InstanceType"
Write-Host "Capacity (min/des/max): $MinSize / $DesiredCapacity / $MaxSize"
Write-Host ''
Write-Host 'RTMP ingest format:   rtmp://<worker-public-ip>:1935/live/<stream-key>'
Write-Host 'HLS playback format:  http://<worker-public-ip>/hls/<stream-key>.m3u8'
