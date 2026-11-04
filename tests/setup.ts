import { beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";

const storePath = path.resolve("data/store.json");
let pristineStore: string = "";

beforeAll(() => {
  if (fs.existsSync(storePath)) {
    pristineStore = fs.readFileSync(storePath, "utf8");
  }
});

afterAll(() => {
  if (pristineStore && fs.existsSync(storePath)) {
    try {
      const current = fs.readFileSync(storePath, "utf8");
      if (current !== pristineStore) {
        fs.writeFileSync(storePath, pristineStore, "utf8");
      }
    } catch {
      // Windows eşzamanlı dosya kilidi durumunda küçük gecikmeyle tekrar dene
      try {
        const current = fs.readFileSync(storePath, "utf8");
        if (current !== pristineStore) {
          fs.writeFileSync(storePath, pristineStore, "utf8");
        }
      } catch {
        // En son durumda göz ardı et
      }
    }
  }
});

