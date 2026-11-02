import { describe, expect, it } from "vitest";

function matchTrack(local: {title:string;artist:string}, imported: {title:string;artist?:string}) {
  return local.title.trim().toLocaleLowerCase() === imported.title.trim().toLocaleLowerCase()
    && (!imported.artist || local.artist.trim().toLocaleLowerCase() === imported.artist.trim().toLocaleLowerCase());
}
describe("playlist metadata matching", () => {
  it("matches title and artist case-insensitively", () => {
    expect(matchTrack({title:"Blue Monday",artist:"New Order"},{title:"blue monday",artist:"new order"})).toBe(true);
  });
  it("does not match a different artist", () => {
    expect(matchTrack({title:"Blue Monday",artist:"New Order"},{title:"Blue Monday",artist:"Other"})).toBe(false);
  });
  it("supports title-only matching when imported artist is missing", () => {
    expect(matchTrack({title:"Song",artist:"Artist"},{title:"Song"})).toBe(true);
  });
});