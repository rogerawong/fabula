import { describe, expect, it } from "vitest";
import { fileNameFromUrl, rewriteGitHubUrl } from "../loadDocument";

describe("rewriteGitHubUrl", () => {
  it("rewrites blob URLs to raw.githubusercontent.com", () => {
    expect(
      rewriteGitHubUrl("https://github.com/dotnet/docfx/blob/main/docs/toc.yml"),
    ).toBe("https://raw.githubusercontent.com/dotnet/docfx/main/docs/toc.yml");
  });

  it("leaves other URLs untouched", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/toc.yml";
    expect(rewriteGitHubUrl(raw)).toBe(raw);
    expect(rewriteGitHubUrl("https://example.com/toc.yml")).toBe(
      "https://example.com/toc.yml",
    );
  });
});

describe("fileNameFromUrl", () => {
  it("takes the last path segment", () => {
    expect(fileNameFromUrl("https://example.com/docs/toc.yml?ref=1")).toBe("toc.yml");
  });
  it("falls back for unparsable input", () => {
    expect(fileNameFromUrl("::nope::")).toBe("toc.yml");
  });
});
