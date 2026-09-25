import http from "http";

const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  expectedStatus: number;
  actualStatus: number;
  details: string;
}

const results: TestResult[] = [];

async function makeRequest(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body,
  });

  let body: any;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  const headersObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  return {
    status: res.status,
    headers: headersObj,
    body,
  };
}

function recordResult(name: string, expectedStatus: number, actualStatus: number, passed: boolean, details: string) {
  results.push({ name, expectedStatus, actualStatus, passed, details });
  const symbol = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${symbol} | ${name} | Expected: ${expectedStatus} | Actual: ${actualStatus} | Details: ${details}`);
}

async function runHardeningTests() {
  console.log("\n=======================================================");
  console.log("STARTING HARDENING & EDGE CASE INTEGRATION TESTS");
  console.log("=======================================================\n");

  // 1. Excessive Limit Clamping
  try {
    const res = await makeRequest("/api/v1/operators?limit=5000");
    const isClamped = res.status === 200 && res.body?.meta?.limit === 100;
    recordResult(
      "Step 4.1: Excessive limit clamped to 100",
      200,
      res.status,
      isClamped,
      `meta.limit = ${res.body?.meta?.limit}`
    );
  } catch (err: any) {
    recordResult("Step 4.1: Excessive limit clamped", 200, 500, false, err.message);
  }

  // 2. Negative Limit
  try {
    const res = await makeRequest("/api/v1/operators?limit=-10");
    const passed = res.status === 400 && res.body?.error?.code === "BAD_REQUEST";
    recordResult("Step 4.2: Negative limit rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.2: Negative limit rejected", 400, 500, false, err.message);
  }

  // 3. Negative Offset
  try {
    const res = await makeRequest("/api/v1/operators?offset=-5");
    const passed = res.status === 400 && res.body?.error?.code === "BAD_REQUEST";
    recordResult("Step 4.3: Negative offset rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.3: Negative offset rejected", 400, 500, false, err.message);
  }

  // 4. Invalid Sort Field
  try {
    const res = await makeRequest("/api/v1/operators?sort=unknown_secret");
    const passed = res.status === 400 && res.body?.error?.message.includes("Allowed fields");
    recordResult("Step 4.4: Unknown sort field rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.4: Unknown sort field rejected", 400, 500, false, err.message);
  }

  // 5. Invalid Order
  try {
    const res = await makeRequest("/api/v1/operators?order=invalid");
    const passed = res.status === 400 && res.body?.error?.code === "BAD_REQUEST";
    recordResult("Step 4.5: Invalid order rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.5: Invalid order rejected", 400, 500, false, err.message);
  }

  // 6. Malformed Identifier
  try {
    const res = await makeRequest("/api/v1/operators/op_INVALID_FORMAT");
    const passed = res.status === 400 && res.body?.error?.code === "BAD_REQUEST";
    recordResult("Step 4.6: Malformed identifier rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.6: Malformed identifier rejected", 400, 500, false, err.message);
  }

  // 7. Non-existent Identifier
  try {
    const res = await makeRequest("/api/v1/operators/op_999999999999999");
    const passed = res.status === 404 && res.body?.error?.code === "NOT_FOUND";
    recordResult("Step 4.7: Unknown ID returns 404", 404, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.7: Unknown ID returns 404", 404, 500, false, err.message);
  }

  // 8. Malformed JSON Body
  try {
    const res = await makeRequest("/api/v1/operators", {
      method: "POST",
      body: "{ bad_json: ",
    });
    const passed = res.status === 400 && res.body?.error?.code === "BAD_REQUEST";
    recordResult("Step 4.8: Malformed JSON body rejected", 400, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.8: Malformed JSON body rejected", 400, 500, false, err.message);
  }

  // 9. Missing Required Body Field (422)
  try {
    const res = await makeRequest("/api/v1/operators", {
      method: "POST",
      body: JSON.stringify({ name: "Incomplete Operator" }),
    });
    const passed = res.status === 422 && res.body?.error?.code === "UNPROCESSABLE_ENTITY";
    recordResult("Step 4.9: Missing required field returns 422", 422, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.9: Missing required field returns 422", 422, 500, false, err.message);
  }

  // 10. Non-existent Operator ID on Route Creation (422)
  try {
    const res = await makeRequest("/api/v1/routes", {
      method: "POST",
      body: JSON.stringify({
        operatorId: "op_nonexistent_9999",
        originState: "Lagos",
        originCity: "Jibowu",
        destinationState: "FCT",
        destinationCity: "Utako",
        distanceKm: 500,
        estimatedMinutes: 450,
        baseFareAmount: 2500000,
      }),
    });
    const passed = res.status === 422 && res.body?.error?.code === "UNPROCESSABLE_ENTITY";
    recordResult("Step 4.10: Missing parent operator returns 422", 422, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 4.10: Missing parent operator returns 422", 422, 500, false, err.message);
  }

  // 11. Unversioned Path Interception (JSON 404)
  try {
    const res = await makeRequest("/api/operators");
    const passed = res.status === 404 && typeof res.body === "object" && res.body?.error?.code === "NOT_FOUND";
    recordResult("Step 3.1: Unversioned route returns JSON 404", 404, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 3.1: Unversioned route returns JSON 404", 404, 500, false, err.message);
  }

  // 12. Non-existent API Path (JSON 404)
  try {
    const res = await makeRequest("/api/v1/nonexistent_resource");
    const passed = res.status === 404 && typeof res.body === "object" && res.body?.error?.code === "NOT_FOUND";
    recordResult("Step 3.2: Made-up path returns JSON 404", 404, res.status, passed, res.body?.error?.message);
  } catch (err: any) {
    recordResult("Step 3.2: Made-up path returns JSON 404", 404, 500, false, err.message);
  }

  // 13. Unsupported HTTP Method (405 with Allow Header)
  try {
    const res = await makeRequest("/api/v1/operators", { method: "PUT" });
    const hasAllow = res.headers["allow"] !== undefined;
    const passed = res.status === 405 && res.body?.error?.code === "METHOD_NOT_ALLOWED" && hasAllow;
    recordResult("Step 3.3: Unsupported PUT returns 405 with Allow header", 405, res.status, passed, `Allow: ${res.headers["allow"]}`);
  } catch (err: any) {
    recordResult("Step 3.3: Unsupported PUT returns 405 with Allow header", 405, 500, false, err.message);
  }

  // 14. Rate Limit Headers Verification (Step 5)
  try {
    const res = await makeRequest("/api/v1/operators");
    const hasLimitHeader = res.headers["x-ratelimit-limit"] !== undefined;
    const hasRemainingHeader = res.headers["x-ratelimit-remaining"] !== undefined;
    const passed = res.status === 200 && hasLimitHeader && hasRemainingHeader;
    recordResult("Step 5.1: Rate limit headers present", 200, res.status, passed, `Limit: ${res.headers["x-ratelimit-limit"]}, Remaining: ${res.headers["x-ratelimit-remaining"]}`);
  } catch (err: any) {
    recordResult("Step 5.1: Rate limit headers present", 200, 500, false, err.message);
  }

  console.log("\n=======================================================");
  const passedTotal = results.filter((r) => r.passed).length;
  console.log(`HARDENING TEST SUMMARY: ${passedTotal} / ${results.length} PASSED`);
  console.log("=======================================================\n");

  if (passedTotal !== results.length) {
    process.exit(1);
  }
}

runHardeningTests();
