import { describe, expect, it } from "vitest";
import { foodFirst } from "./places";

const photo = (name: string, author?: string) => ({ name, authorAttributions: author ? [{ displayName: author }] : [] });

describe("foodFirst", () => {
  it("puts visitors' photos first, the business's next, and the cover (storefront) last", () => {
    const { photos, storefront } = foodFirst(
      [photo("cover", "Condado Tacos"), photo("own", "Condado Tacos | Mexican"), photo("v1", "Sam Lee"), photo("v2", "Ana P")],
      "Condado Tacos | Mexican",
    );
    expect(photos.map((p) => p.name)).toEqual(["v1", "v2", "own", "cover"]);
    expect(storefront).toEqual({ name: "cover", author: "Condado Tacos" });
  });

  it("keeps at most five", () => {
    const many = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, `Visitor ${i}`));
    expect(foodFirst(many, "Kai Poke").photos).toHaveLength(5);
  });

  it("uses the only photo there is, with no separate storefront", () => {
    expect(foodFirst([photo("only", "Kai Poke")], "Kai Poke")).toEqual({ photos: [{ name: "only", author: "Kai Poke" }], storefront: null });
    expect(foodFirst(undefined, "Kai Poke")).toEqual({ photos: [], storefront: null });
  });
});
