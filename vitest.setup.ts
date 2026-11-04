import "@testing-library/jest-dom";

import os from "node:os";
import path from "node:path";

// Keep tests from clobbering the developer's real dashboard cache snapshot.
process.env.DASHBOARD_METRICS_CACHE_PATH = path.join(os.tmpdir(), `my-health-vitest-cache-${process.pid}.json`);
