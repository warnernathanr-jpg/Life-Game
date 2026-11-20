// Getting started: the six steps of the guided start (public.my_tutorial() reports which are done). Each step is ticked
// by what the player has actually done; finishing pays 100 coins (claim_reward('tutorial')).

export type TutorialState = {
  has_task: boolean;
  has_checkoff: boolean;
  has_road: boolean;
  has_home: boolean;
  has_resident: boolean;
  has_color: boolean;
  has_shop: boolean;
  hidden: boolean;
  claimed: boolean;
};

export type TutorialStep = {
  id: "task" | "check" | "road" | "home" | "color" | "shop";
  title: string;
  /** How to do it. */
  how: string;
  /** Where it's done: the Tasks page or the full-screen city. */
  where: "tasks" | "city";
  done: (s: TutorialState) => boolean;
  /** A nudge when it's half done (e.g. built, but not beside the road). */
  hint?: (s: TutorialState) => string | null;
};

export const TUTORIAL_REWARD = 100; // claim_reward('tutorial')

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "task",
    title: "Add your first task",
    how: "Something you'll do today, like a 10-minute walk or reading a chapter.",
    where: "tasks",
    done: (s) => s.has_task,
  },
  {
    id: "check",
    title: "Check it off",
    how: "Tap the circle when it's done. Every check-off earns coins to build with.",
    where: "tasks",
    done: (s) => s.has_checkoff,
  },
  {
    id: "road",
    title: "Lay a road",
    how: "Tap Roads, pick Dirt Road, drag a short line across your land, then Build. It costs 1 coin a tile.",
    where: "city",
    done: (s) => s.has_road,
  },
  {
    id: "home",
    title: "Build a home beside the road",
    how: "Tap Residential, pick Small Cottage (25 coins) and put it right next to your road. People move in once it touches a road.",
    where: "city",
    done: (s) => s.has_resident,
    hint: (s) => (s.has_home && !s.has_resident ? "Your home isn't touching a road yet. Select it and move it next to the road." : null),
  },
  {
    id: "color",
    title: "Give it your own colors",
    how: "Tap your new home to select it, then pick one of the colors in the panel. Changing colors is free.",
    where: "city",
    done: (s) => s.has_color,
  },
  {
    id: "shop",
    title: "Open a shop beside the road",
    how: "Tap Commercial, pick Convenience Store (60 coins) and put it next to the road too. Shops give your residents jobs.",
    where: "city",
    done: (s) => s.has_shop,
  },
];

/** The first step not done yet, or null when every step is done. */
export function currentStep(s: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS.find((step) => !step.done(s)) ?? null;
}

/** Whether the guide should show at all. */
export function tutorialActive(s: TutorialState | null | undefined): s is TutorialState {
  return !!s && !s.hidden && !s.claimed;
}
