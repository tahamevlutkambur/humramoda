import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  toKurus,
  fromKurus,
  slugifyTurkish,
} from "../src/lib/formatters";

describe("Formatters & Currency Utilities", () => {
  it("formats Turkish Lira correctly with comma separator", () => {
    expect(formatCurrency(1574.1)).toBe("1.574,10 ₺");
    expect(formatCurrency(0)).toBe("0,00 ₺");
    expect(formatCurrency(3500)).toBe("3.500,00 ₺");
  });

  it("converts TL to PayTR kuruş integers accurately", () => {
    expect(toKurus(1574.1)).toBe(157410);
    expect(toKurus("1574.10")).toBe(157410);
    expect(toKurus(95.5)).toBe(9550);
    expect(toKurus(0)).toBe(0);
  });

  it("converts kuruş back to TL decimal", () => {
    expect(fromKurus(157410)).toBe(1574.1);
    expect(fromKurus(9550)).toBe(95.5);
  });

  it("slugifies Turkish text correctly preserving meaning and removing special characters", () => {
    expect(
      slugifyTurkish("Qapitone Garnili Scuba İkili Takım — Siyah")
    ).toBe("qapitone-garnili-scuba-ikili-takim-siyah");

    expect(
      slugifyTurkish("Şardonlu Ceket & Pantolon Takımı")
    ).toBe("sardonlu-ceket-pantolon-takimi");

    expect(
      slugifyTurkish("1 ALANA 1 BEDAVA! Özel Fırsat")
    ).toBe("1-alana-1-bedava-ozel-firsat");
  });
});
