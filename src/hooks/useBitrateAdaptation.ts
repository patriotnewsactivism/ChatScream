import { useEffect, useState } from 'react';

interface NetworkCondition {
  bandwidth: number;
  rtt: number;
  packetLoss: number;
  jitter: number;
  timestamp: Date;
}

const useBitrateAdaptation = () => {
  const [networkHistory, setNetworkHistory] = useState<NetworkCondition[]>([]);
  const [currentBitrate, setCurrentBitrate] = useState<number>(1000);

  useEffect(() => {
    const interval = setInterval(() => {
      const newCondition: NetworkCondition = {
        bandwidth: Math.random() * 10000,
        rtt: Math.random() * 100,
        packetLoss: Math.random() * 10,
        jitter: Math.random() * 50,
        timestamp: new Date(),
      };
      setNetworkHistory((prev) => [...prev, newCondition]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const calculateOptimalBitrate = (condition: NetworkCondition): number => {
    // Placeholder logic for calculating optimal bitrate
    return Math.min(condition.bandwidth, 2000);
  };

  const adaptBitrate = () => {
    const predictedBitrate = predictNextBitrate();
    setCurrentBitrate(predictedBitrate);
  };

  const calculateStabilityScore = (): number => {
    if (networkHistory.length < 2) return 100;

    const variations = [];
    for (let i = 1; i < networkHistory.length; i++) {
      const prev = networkHistory[i - 1];
      const curr = networkHistory[i];
      const variation = Math.abs(curr.bandwidth - prev.bandwidth) / prev.bandwidth;
      variations.push(variation);
    }

    const avgVariation = variations.reduce((sum, v) => sum + v, 0) / variations.length;
    return Math.max(0, Math.min(100, (1 - avgVariation) * 100));
  };

  const predictNextBitrate = (): number => {
    if (networkHistory.length < 5) return currentBitrate;

    const recentTrend = networkHistory.slice(-5);
    const bandwidthTrend = recentTrend.map((cond) => cond.bandwidth);

    const slope =
      (bandwidthTrend[bandwidthTrend.length - 1] - bandwidthTrend[0]) / bandwidthTrend.length;

    const predictedBandwidth = bandwidthTrend[bandwidthTrend.length - 1] + slope * 3;

    return calculateOptimalBitrate({
      bandwidth: predictedBandwidth,
      rtt: recentTrend[recentTrend.length - 1].rtt,
      packetLoss: recentTrend[recentTrend.length - 1].packetLoss,
      jitter: recentTrend[recentTrend.length - 1].jitter,
      timestamp: new Date(),
    });
  };

  return { adaptBitrate };
};

export default useBitrateAdaptation;