import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type CurrentSpace =
  | { kind: "personal" }
  | { kind: "org"; orgId: string; slug: string };

type SpaceState = {
  current: CurrentSpace;
};

const initialState: SpaceState = {
  current: { kind: "personal" },
};

export const spaceSlice = createSlice({
  name: "space",
  initialState,
  reducers: {
    setCurrentSpace(state, action: PayloadAction<CurrentSpace>) {
      state.current = action.payload;
    },
    clearOrgSpace(state, action: PayloadAction<{ orgId: string }>) {
      if (
        state.current.kind === "org" &&
        state.current.orgId === action.payload.orgId
      ) {
        state.current = { kind: "personal" };
      }
    },
  },
});

export const { setCurrentSpace, clearOrgSpace } = spaceSlice.actions;
