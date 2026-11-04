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
  respiratoryRate: {
    why: "Respiratory rate helps track recovery quality, illness load, and overnight strain.",
    trendMeaning: "Stable values are common; sustained elevations can signal fatigue, stress, or respiratory disruption.",
    actionableRecommendations: "Watch for multi-day increases alongside poor sleep or low readiness before pushing intensity.",
  },
  hrvRmssd: {
    why: "RMSSD is another HRV lens that emphasizes parasympathetic recovery and overnight readiness.",
    trendMeaning: "Higher stable values generally reflect stronger recovery capacity; repeated drops may signal accumulated stress.",
    actionableRecommendations: "Use RMSSD with resting HR and sleep before deciding on hard training days.",
  },
  walkingHeartRateAverage: {
    why: "Walking heart rate average reflects how hard routine movement feels at a low aerobic load.",
    trendMeaning: "Lower or stable values at similar activity can indicate improved efficiency; rising values may indicate stress or deconditioning.",
    actionableRecommendations: "Compare this metric with steps and recovery metrics to spot easy-effort days that feel unusually costly.",
  },
  sleepingWristTemperature: {
    why: "Sleeping wrist temperature can highlight recovery disruption, stress, or the early onset of illness.",
    trendMeaning: "Day-to-day fluctuations are normal, but sustained deviations from baseline are more meaningful than a single night.",
    actionableRecommendations: "Treat several elevated nights in a row as a cue to prioritize sleep, hydration, and lower training load.",
  },
  timeInDaylight: {
    why: "Time in daylight reflects outdoor light exposure, which can support circadian rhythm and sleep timing.",
    trendMeaning: "Higher daylight exposure often aligns with better routine consistency; long indoor stretches can reduce that signal.",
    actionableRecommendations: "Use daylight minutes as a habit metric—morning outdoor exposure can help sleep timing and recovery.",
  },
  runningCadence: {
    why: "Running cadence shows step rate and helps describe running rhythm and efficiency.",
    trendMeaning: "Cadence usually shifts with pace, terrain, and fatigue; sudden drops at similar pace can reflect form breakdown.",
    actionableRecommendations: "Track cadence together with pace and ground contact time rather than chasing a single universal target.",
  },
  runningPower: {
    why: "Running power estimates the mechanical demand of each run beyond pace alone.",
    trendMeaning: "Higher power at similar pace may reflect harder terrain or fatigue; stable power with faster pace can suggest efficiency gains.",
    actionableRecommendations: "Use power alongside pace, HR, and recovery to separate effort from external conditions like hills or wind.",
  },
  runningStride: {
    why: "Stride length helps explain how you generate speed and whether form changes across workouts.",
    trendMeaning: "Longer stride at similar cadence often comes with faster pace, but excessive changes can also reflect fatigue or overstriding.",
    actionableRecommendations: "Review stride together with cadence and ground contact time instead of optimizing it in isolation.",
  },
  groundContact: {
    why: "Ground contact time measures how long each foot stays on the ground during running.",
    trendMeaning: "Shorter contact time at similar pace can indicate fresher mechanics; longer times may appear with fatigue or hills.",
    actionableRecommendations: "Use this as a trend metric across similar runs, not as a standalone target on every workout.",
  },
  verticalOscillation: {
    why: "Vertical oscillation estimates how much you bounce upward while running.",
    trendMeaning: "Lower values at similar pace may indicate more economical mechanics, though context matters across terrains and workouts.",
    actionableRecommendations: "Interpret oscillation together with cadence, pace, and perceived effort rather than minimizing it at all costs.",
  },
};
