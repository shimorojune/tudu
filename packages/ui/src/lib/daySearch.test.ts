import { describe, expect, it } from "vitest";
import { todayIso } from "@tudu/store";
import {
  dateLinkSearch,
  daySearchEqual,
  daySearchToastMessage,
  dayStateFromSearch,
  findDaySearchIssues,
  firstDaySearchIssue,
  mergeDaySearch,
  parseDateSearch,
  parseDaySearch,
  parseTabSearch,
  parseTaskSearch,
  planDaySearchSync,
  rawSearchFromString,
  serializeDaySearch,
} from "./daySearch";

const taskId = "11111111-1111-4111-8111-111111111111";

function offsetIso(dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("parseDateSearch", () => {
  it("keeps a real calendar day and drops junk", () => {
    const tomorrow = offsetIso(1);
    expect(parseDateSearch({ date: tomorrow })).toEqual({ date: tomorrow });
    expect(parseDateSearch({ date: "banana" })).toEqual({});
    expect(parseDateSearch({ date: "2026-02-31" })).toEqual({});
    expect(parseDateSearch({})).toEqual({});
  });
});

describe("parseTaskSearch", () => {
  it("keeps a uuid and drops junk", () => {
    expect(parseTaskSearch({ task: taskId })).toEqual({ task: taskId });
    expect(parseTaskSearch({ task: "nope" })).toEqual({});
  });
});

describe("parseTabSearch", () => {
  it("keeps comments or timeline and drops details or junk", () => {
    expect(parseTabSearch({ tab: "comments" })).toEqual({ tab: "comments" });
    expect(parseTabSearch({ tab: "timeline" })).toEqual({ tab: "timeline" });
    expect(parseTabSearch({ tab: "details" })).toEqual({});
    expect(parseTabSearch({ tab: "banana" })).toEqual({});
  });
});

describe("parseDaySearch", () => {
  it("only reads the fields the route owns", () => {
    const tomorrow = offsetIso(1);
    expect(
      parseDaySearch(
        { date: tomorrow, task: taskId, tab: "comments", project: "x" },
        { date: true },
      ),
    ).toEqual({ date: tomorrow });
    expect(
      parseDaySearch(
        { date: tomorrow, task: taskId, tab: "comments" },
        { task: true, tab: true },
      ),
    ).toEqual({ task: taskId, tab: "comments" });
  });
});

describe("serializeDaySearch", () => {
  it("omits today, a closed task, and the details tab", () => {
    const tomorrow = offsetIso(1);
    expect(
      serializeDaySearch(
        { date: todayIso(), taskId: null, tab: "details" },
        { date: true, task: true, tab: true },
      ),
    ).toEqual({});
    expect(
      serializeDaySearch(
        { date: tomorrow, taskId, tab: "comments" },
        { date: true, task: true, tab: true },
      ),
    ).toEqual({ date: tomorrow, task: taskId, tab: "comments" });
    expect(
      serializeDaySearch(
        { date: tomorrow, taskId: null, tab: "comments" },
        { date: true, task: true, tab: true },
      ),
    ).toEqual({ date: tomorrow });
  });
});

describe("dayStateFromSearch", () => {
  it("treats a missing date as today, except on a week", () => {
    const today = todayIso();
    const tomorrow = offsetIso(1);
    expect(
      dayStateFromSearch({
        fields: { date: true, task: true, tab: true },
        parsed: {},
        today,
      }),
    ).toEqual({ date: today, taskId: null, inspectorTab: "details" });
    expect(
      dayStateFromSearch({
        fields: { date: true },
        parsed: { date: tomorrow },
        today,
        weekDays: [today],
      }),
    ).toEqual({ date: today });
    expect(
      dayStateFromSearch({
        fields: { date: true },
        parsed: {},
        today,
        weekDays: [today, tomorrow],
      }),
    ).toEqual({});
  });
});

describe("mergeDaySearch", () => {
  it("writes new day params and drops omitted ones", () => {
    const tomorrow = offsetIso(1);
    expect(
      mergeDaySearch(
        { project: "p", date: todayIso(), task: taskId },
        { date: true, task: true, tab: true },
        { date: tomorrow },
      ),
    ).toEqual({ project: "p", date: tomorrow });
  });
});

describe("daySearch helpers", () => {
  it("parses a query string and picks one toast", () => {
    expect(rawSearchFromString("?date=banana&task=nope")).toEqual({
      date: "banana",
      task: "nope",
    });
    expect(firstDaySearchIssue(["invalidTab", "invalidDate"])).toBe(
      "invalidDate",
    );
    expect(daySearchToastMessage("invalidDate")).toBe(
      "That date is not valid. Opened today instead.",
    );
    expect(daySearchEqual({ date: "a" }, { date: "a" })).toBe(true);
    expect(dateLinkSearch(todayIso(), { send: false })).toEqual({ send: false });
  });
});

describe("findDaySearchIssues", () => {
  it("flags present junk and a date outside the week", () => {
    const tomorrow = offsetIso(1);
    expect(
      findDaySearchIssues(
        { date: "banana", task: "nope", tab: "banana" },
        { date: true, task: true, tab: true },
      ),
    ).toEqual(["invalidDate", "invalidTask", "invalidTab"]);
    expect(
      findDaySearchIssues({ date: tomorrow }, { date: true }, { weekDays: [todayIso()] }),
    ).toEqual(["dateNotInWeek"]);
    expect(findDaySearchIssues({}, { date: true, task: true, tab: true })).toEqual(
      [],
    );
    expect(
      findDaySearchIssues({ tab: "details" }, { tab: true }),
    ).toEqual([]);
  });
});

describe("planDaySearchSync", () => {
  const fields = { date: true, task: true, tab: true } as const;

  it("does not strip a deep link while Redux is still empty", () => {
    const today = todayIso();
    const plan = planDaySearchSync({
      fields,
      parsed: { task: taskId, tab: "comments" },
      redux: { date: today, taskId: null, tab: "details" },
      today,
      urlChanged: true,
      reduxChanged: false,
      issues: [],
    });
    expect(plan.hydrate).toEqual({
      taskId,
      inspectorTab: "comments",
    });
    expect(plan.write).toBeUndefined();
  });

  it("writes the URL when Redux changes and the URL has not", () => {
    const today = todayIso();
    const tomorrow = offsetIso(1);
    const plan = planDaySearchSync({
      fields,
      parsed: { task: taskId },
      redux: { date: tomorrow, taskId: null, tab: "details" },
      today,
      urlChanged: false,
      reduxChanged: true,
      issues: [],
    });
    expect(plan.hydrate).toBeUndefined();
    expect(plan.write).toEqual({ date: tomorrow });
    expect(plan.replace).toBe(false);
  });

  it("does nothing when URL and Redux already match", () => {
    const today = todayIso();
    const plan = planDaySearchSync({
      fields,
      parsed: { task: taskId, tab: "comments" },
      redux: { date: today, taskId, tab: "comments" },
      today,
      urlChanged: false,
      reduxChanged: false,
      issues: [],
    });
    expect(plan).toEqual({ action: "none" });
  });

  it("does not strip a deep link when only hook options change", () => {
    const today = todayIso();
    const plan = planDaySearchSync({
      fields,
      parsed: { task: taskId, tab: "comments" },
      redux: { date: today, taskId: null, tab: "details" },
      today,
      urlChanged: false,
      reduxChanged: false,
      issues: [],
    });
    expect(plan).toEqual({ action: "none" });
  });

  it("clears a missing task without a toast when silentMissingTask is set", () => {
    const today = todayIso();
    const plan = planDaySearchSync({
      fields: { task: true, tab: true },
      parsed: { task: taskId },
      redux: { date: today, taskId, tab: "details" },
      today,
      urlChanged: true,
      reduxChanged: false,
      issues: [],
      taskFound: false,
      silentMissingTask: true,
    });
    expect(plan.toast).toBeUndefined();
    expect(plan.hydrate).toEqual({ taskId: null, inspectorTab: "details" });
  });
});
