import { describe, expect, it } from "vitest";
import { parseSms, extractPeopleCount, matchPlace } from "@/lib/core/smsParser";

describe("parseSms — help", () => {
  it.each([
    ["HELP", null],
    ["help", null],
    ["Help!", null],
    ["HELP 3 people roof", 3],
    ["help 5", 5],
    ["  HeLp   two of us  ", 2],
    ["SOS 4 pple", 4],
    ["help us we dey trap", null],
    ["we dey trap for roof 6 people", 6],
    ["Abeg help water don enter house", null],
    ["please help my mama is sick", null],
    ["we are trapped", null],
    ["Taimako", null],
  ])("%s → help (people %s)", (text, people) => {
    const r = parseSms(text);
    expect(r.kind).toBe("help");
    if (r.kind === "help") expect(r.peopleCount).toBe(people);
  });

  it("keeps the free text as a note", () => {
    const r = parseSms("HELP 3 people roof Kpata market");
    expect(r).toMatchObject({ kind: "help", peopleCount: 3, note: "3 people roof Kpata market" });
  });

  it("help beats safe when both appear", () => {
    expect(parseSms("we are not safe please help").kind).toBe("help");
  });
});

describe("parseSms — other commands", () => {
  it.each(["SAFE", "safe", "I am safe", "I'm safe", "we dey safe o", "I dey okay"])("%s → safe", (t) => {
    expect(parseSms(t).kind).toBe("safe");
  });

  it("WATER knee → water report with depth", () => {
    expect(parseSms("WATER knee")).toMatchObject({ kind: "report", reportType: "water_level", depthCm: 50, depthLabel: "knee" });
  });
  it("WATER waist Kpata Market → landmark text", () => {
    expect(parseSms("water waist at Kpata Market")).toMatchObject({ kind: "report", depthCm: 100, landmarkText: "kpata market" });
  });
  it("WATER 30cm → numeric depth", () => {
    expect(parseSms("WATER 30cm")).toMatchObject({ kind: "report", depthCm: 30 });
  });
  it("ROAD blocked <landmark>", () => {
    expect(parseSms("ROAD blocked Ganaja junction")).toMatchObject({ kind: "report", reportType: "road_blocked", landmarkText: "ganaja junction" });
  });
  it("DRAIN blocked", () => {
    expect(parseSms("drain blocked")).toMatchObject({ kind: "report", reportType: "drain_blocked" });
  });
  it("water + trapped is help, not a report", () => {
    expect(parseSms("water don reach roof we dey trap").kind).toBe("help");
  });
  it.each([
    ["STOP", "stop"],
    ["START", "start"],
    ["DELETE", "delete"],
    ["SHELTER", "shelter"],
    ["hello?", "unknown"],
    ["", "unknown"],
  ])("%s → %s", (t, k) => expect(parseSms(t).kind).toBe(k));
  it("LANG pidgin", () => expect(parseSms("LANG pidgin")).toEqual({ kind: "lang", lang: "pcm" }));
  it("LANG HA", () => expect(parseSms("lang ha")).toEqual({ kind: "lang", lang: "ha" }));
});

describe("helpers", () => {
  it("extractPeopleCount ignores absurd numbers", () => {
    expect(extractPeopleCount("help 9999")).toBeNull();
    expect(extractPeopleCount("only me")).toBe(1);
  });
  it("matchPlace finds landmarks in free text", () => {
    const c = [
      { id: "kpata", name: "Kpata Market" },
      { id: "ganaja", name: "Ganaja Junction" },
      { id: "main", name: "Lokoja Main Market" },
    ];
    expect(matchPlace("we dey near kpata", c)?.id).toBe("kpata");
    expect(matchPlace("Ganaja junction by the filling", c)?.id).toBe("ganaja");
    expect(matchPlace("market", c)).toBeNull();
    expect(matchPlace("nothing here", c)).toBeNull();
  });
});
