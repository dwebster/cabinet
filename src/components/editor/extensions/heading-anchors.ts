import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const HEADING_ANCHOR_KEY = new PluginKey("headingAnchors");

export const HeadingAnchors = Extension.create({
  name: "headingAnchors",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: HEADING_ANCHOR_KEY,
        view: () => ({
          update(view) {
            const headings = view.dom.querySelectorAll("h1, h2, h3, h4");
            const seen = new Map<string, number>();
            headings.forEach((el) => {
              const base = slugify(el.textContent ?? "");
              if (!base) return;
              const count = seen.get(base) ?? 0;
              seen.set(base, count + 1);
              el.id = count === 0 ? base : `${base}-${count}`;
            });
          },
        }),
      }),
    ];
  },
});
