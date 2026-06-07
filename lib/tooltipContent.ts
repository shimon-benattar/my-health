export interface TooltipContent {
  why: string;
  trendMeaning: string;
  actionableRecommendations: string;
}

export const TOOLTIP_CONTENT: Record<string, TooltipContent> = {
  vo2Max: {
    why: "VO2 Max estimates how efficiently your body uses oxygen during effort.",
    trendMeaning: "A rising trend usually reflects improved cardio conditioning; a falling trend can indicate deconditioning or fatigue.",
    actionableRecommendations: "Prioritize aerobic sessions, maintain weekly consistency, and include recovery days to consolidate gains.",
  },
  rhr: {
    why: "Resting Heart Rate reflects baseline cardiovascular strain and recovery state.",
    trendMeaning: "Lower stable values are often positive; sudden spikes can point to stress, poor sleep, or illness.",
    actionableRecommendations: "Track morning RHR trends, reduce training load during spikes, and focus on hydration and sleep quality.",
  },
  hrv: {
    why: "Heart Rate Variability is a proxy for nervous-system balance and readiness.",
    trendMeaning: "Higher consistent HRV often indicates better recovery; prolonged drops may signal accumulated stress.",
    actionableRecommendations: "Adjust intensity when HRV drops, prioritize sleep, and use low-intensity sessions until HRV rebounds.",
  },
  sleep: {
    why: "Sleep duration supports recovery, hormone balance, and performance adaptation.",
    trendMeaning: "Consistent 7-9 hour patterns generally improve readiness; irregular or short sleep reduces resilience.",
    actionableRecommendations: "Set a fixed sleep schedule, reduce late-night stimulants, and protect pre-sleep wind-down time.",
  },
  steps: {
    why: "Steps reflect daily movement load and general activity volume.",
    trendMeaning: "Rising trends indicate higher daily movement; drops may indicate lower baseline activity.",
    actionableRecommendations: "Treat steps as a standalone health metric and aim for stable weekly totals.",
  },
  activeCalories: {
    why: "Active Calories estimate movement-related energy burn above resting metabolism.",
    trendMeaning: "Rising trends usually reflect higher training or movement load; abrupt drops can indicate lower activity or reduced intensity.",
    actionableRecommendations: "Use this with sleep and readiness to balance load and recovery, especially across hard training weeks.",
  },
  runningPeak: {
    why: "Running peak heart rate indicates upper aerobic and threshold stress.",
    trendMeaning: "Rising peaks with stable recovery can reflect fitness gains; frequent very high peaks may indicate overreaching.",
    actionableRecommendations: "Balance hard intervals with easy runs and monitor recovery metrics after high-intensity sessions.",
  },
  padelPeak: {
    why: "Padel peak heart rate captures interval bursts and repeated explosive efforts.",
    trendMeaning: "High variability is expected; sustained excessive peaks without recovery can increase fatigue risk.",
    actionableRecommendations: "Use active recovery between sessions and include mobility plus conditioning for repeatability.",
  },
};
