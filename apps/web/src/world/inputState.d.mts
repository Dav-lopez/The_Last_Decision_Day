export type MovementInput = {
  pressed: Set<string>;
  press: (source: string, key: string) => void;
  release: (source: string) => void;
  clear: () => void;
};
export declare function createMovementInput(): MovementInput;
