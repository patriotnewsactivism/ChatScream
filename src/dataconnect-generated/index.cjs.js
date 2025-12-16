const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'chatscream',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const createDemoUserRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateDemoUser');
}
createDemoUserRef.operationName = 'CreateDemoUser';
exports.createDemoUserRef = createDemoUserRef;

exports.createDemoUser = function createDemoUser(dc) {
  return executeMutation(createDemoUserRef(dc));
};

const listStreamsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListStreams');
}
listStreamsRef.operationName = 'ListStreams';
exports.listStreamsRef = listStreamsRef;

exports.listStreams = function listStreams(dc) {
  return executeQuery(listStreamsRef(dc));
};

const createDonationRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateDonation', inputVars);
}
createDonationRef.operationName = 'CreateDonation';
exports.createDonationRef = createDonationRef;

exports.createDonation = function createDonation(dcOrVars, vars) {
  return executeMutation(createDonationRef(dcOrVars, vars));
};

const getMyDonationGoalsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMyDonationGoals');
}
getMyDonationGoalsRef.operationName = 'GetMyDonationGoals';
exports.getMyDonationGoalsRef = getMyDonationGoalsRef;

exports.getMyDonationGoals = function getMyDonationGoals(dc) {
  return executeQuery(getMyDonationGoalsRef(dc));
};
