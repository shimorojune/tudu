import { describe, expect, it } from "vitest";
import { makeStore } from "../store.js";
import { selectVisible } from "./slice.js";

describe("sync hooks surface", () => {
  it("selectVisible returns an empty map for a fresh store", () => {
    const store = makeStore();
    const visible = selectVisible(store.getState());
    expect(visible.tasks).toEqual({});
  });
});
