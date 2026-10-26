import { describe, expect, test } from "bun:test";
import {
  FrontmatterError,
  formatScalar,
  parseFrontmatter,
  splitDocument,
  stringifyFrontmatter,
} from "../.keystone/operations/core/frontmatter.ts";
import { fromMeta, renderStone, toMeta } from "../.keystone/operations/core/stone.ts";

describe("splitDocument", () => {
  test("splits frontmatter and preserves the body verbatim", () => {
    const doc = splitDocument("---\nid: a\n---\n\n# Title\n\ntext\n");
    expect(doc.frontmatter).toBe("id: a");
    expect(doc.body).toBe("\n# Title\n\ntext\n");
  });

  test("normalizes CRLF and BOM", () => {
    const doc = splitDocument("\uFEFF---\r\nid: a\r\n---\r\nbody\r\n");
    expect(doc.frontmatter).toBe("id: a");
    expect(doc.body).toBe("body\n");
  });

  test("rejects missing delimiters", () => {
    expect(() => splitDocument("id: a\n")).toThrow(FrontmatterError);
    expect(() => splitDocument("---\nid: a\n")).toThrow(/closing/);
  });
});

describe("parseFrontmatter", () => {
  test("parses scalars, quoting and inline comments", () => {
    const data = parseFrontmatter(
      [
        "id: auth # trailing comment",
        'summary: "Handles: tokens # not a comment"',
        "owner: 'squad ''core'''",
        "plain: C# interop",
      ].join("\n"),
    );
    expect(data.id).toBe("auth");
    expect(data.summary).toBe("Handles: tokens # not a comment");
    expect(data.owner).toBe("squad 'core'");
    expect(data.plain).toBe("C# interop");
  });

  test("parses inline and block lists", () => {
    const data = parseFrontmatter("tags: [a, 'b, c', \"d\"]\nmore:\n  - x\n  - y\nempty: []");
    expect(data.tags).toEqual(["a", "b, c", "d"]);
    expect(data.more).toEqual(["x", "y"]);
    expect(data.empty).toEqual([]);
  });

  test("parses nested maps of lists", () => {
    const data = parseFrontmatter(
      ["relations:", "  depends_on: [users]", "  depended_by:", "    - billing", "    - api", "  children:", "summary: s"].join("\n"),
    );
    expect(data.relations).toEqual({ depends_on: ["users"], depended_by: ["billing", "api"], children: [] });
    expect(data.summary).toBe("s");
  });

  test("parses folded and literal block scalars", () => {
    const folded = parseFrontmatter("summary: >\n  line one\n  line two\nid: x");
    expect(folded.summary).toBe("line one line two");
    expect(folded.id).toBe("x");
    const literal = parseFrontmatter("summary: |\n  line one\n  line two\n");
    expect(literal.summary).toBe("line one\nline two");
  });

  test("skips comments and blank lines", () => {
    expect(parseFrontmatter("# header\n\nid: a\n\n# tail")).toEqual({ id: "a" });
  });

  test("reports errors with line numbers", () => {
    expect(() => parseFrontmatter("id: a\nid: b", 2)).toThrow(/line 3: duplicate key 'id'/);
    expect(() => parseFrontmatter("  id: a")).toThrow(/must not be indented/);
    expect(() => parseFrontmatter("not a key")).toThrow(/expected 'key: value'/);
    expect(() => parseFrontmatter("tags: [a, b")).toThrow(/unterminated inline list/);
    expect(() => parseFrontmatter("relations:\n  depends_on: users")).toThrow(/must hold a list/);
    expect(() => parseFrontmatter("tags:\n  - a\n    - b")).toThrow(/unexpected indentation/);
  });
});

describe("serialization", () => {
  test("quotes only when needed", () => {
    expect(formatScalar("auth")).toBe("auth");
    expect(formatScalar("Issues JWT tokens.")).toBe("Issues JWT tokens.");
    expect(formatScalar("a: b")).toBe('"a: b"');
    expect(formatScalar("true")).toBe('"true"');
    expect(formatScalar("42")).toBe('"42"');
    expect(formatScalar("- dash")).toBe('"- dash"');
    expect(formatScalar("")).toBe('""');
    expect(formatScalar("x # y")).toBe('"x # y"');
  });

  test("round-trips arbitrary data", () => {
    const data = {
      id: "auth",
      tags: ["jwt", "a: b"],
      relations: { depends_on: ["users"], depended_by: [], children: ["x"] },
      summary: 'Quotes " and colons: fine',
    };
    expect(parseFrontmatter(stringifyFrontmatter(data))).toEqual(data);
  });

  test("renderStone preserves the body byte-for-byte and orders keys canonically", () => {
    const source = "---\nsummary: S\nid: a\ntype: module\ncustom: kept\n---\n\n# Title\n\n  indented\n";
    const { frontmatter, body } = splitDocument(source);
    const meta = toMeta(parseFrontmatter(frontmatter));
    const rendered = renderStone(meta, body);
    expect(rendered.endsWith("---\n\n# Title\n\n  indented\n")).toBe(true);
    expect(rendered.split("\n").slice(1, 3)).toEqual(["id: a", "type: module"]);
    expect(rendered).toContain("custom: kept");
    expect(toMeta(parseFrontmatter(splitDocument(rendered).frontmatter))).toEqual(meta);
    expect(fromMeta(meta).relations).toEqual({ depends_on: [], depended_by: [], children: [] });
  });
});
