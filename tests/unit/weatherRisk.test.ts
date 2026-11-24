import { describe, expect, it } from "vitest";
import { calculateWeatherRisk, describeWmo, weatherEventSeverity } from "@/lib/core/weatherRisk";
import { NEED_TYPES } from "@/lib/core/needs";

const calm = { rainfall: 0, humidity: 50, pressure: 1012, condition: "clear sky" };

describe("calculateWeatherRisk", () => {
  it("is safe in normal weather", () => {
    const r = calculateWeatherRisk(calm);
    expect(r.level).toBe("safe");
    expect(r.percentage).toBe(0);
    expect(r.factors).toEqual(["Normal weather conditions"]);
  });

  it("scores heavy rain + humidity + rain condition as moderate", () => {
    const r = calculateWeatherRisk({ rainfall: 30, humidity: 90, pressure: 1008, condition: "heavy rain" });
    expect(r.percentage).toBe(40);
    expect(r.level).toBe("moderate");
    expect(r.factors).toContain("Heavy rainfall");
  });

  it("adds river discharge and rising trend, capped at 100 and critical", () => {
    const r = calculateWeatherRisk({ rainfall: 60, humidity: 95, pressure: 995, condition: "thunderstorm", riverDischarge: [1200, 1300, 1400] });
    expect(r.level).toBe("critical");
    expect(r.percentage).toBe(100);
    expect(r.factors).toEqual(expect.arrayContaining(["Extreme river discharge", "Rising river levels", "Thunderstorm", "Low pressure"]));
    expect(r.riverDischarge).toBe(1200);
  });

  it("does not add rising trend for small rivers", () => {
    const r = calculateWeatherRisk({ ...calm, riverDischarge: [60, 70, 80] });
    expect(r.factors).toEqual(["Elevated river discharge"]);
    expect(r.percentage).toBe(10);
  });
});

describe("weatherEventSeverity", () => {
  it("ignores light rain", () => expect(weatherEventSeverity(3, "light rain")).toBeNull());
  it("medium for heavy rain", () => expect(weatherEventSeverity(30, "rain")).toBe("medium"));
  it("high for extreme rain or storms", () => {
    expect(weatherEventSeverity(55, "rain")).toBe("high");
    expect(weatherEventSeverity(0, "thunderstorm")).toBe("high");
  });
});

describe("describeWmo / needs", () => {
  it("maps WMO codes", () => {
    expect(describeWmo(95).main).toBe("Thunderstorm");
    expect(describeWmo(63).description).toBe("moderate rain");
    expect(describeWmo(1234).main).toBe("Unknown");
  });
  it("has 12 unique need types", () => expect(new Set(NEED_TYPES).size).toBe(12));
});
