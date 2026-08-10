import { defineConfig } from "vite";

export default defineConfig({
  /**
   * Relative, not "/deterministic-plinko/".
   *
   * GitHub Pages serves a project site from a subdirectory named after the
   * repository, so an absolute base has to hardcode that name and breaks the
   * moment the repo is renamed, forked, or served from anywhere else — the
   * failure being a blank page and a console full of 404s for assets that are
   * sitting right there. Relative URLs resolve against whatever directory
   * index.html was served from, so the same build works at the domain root, at
   * /deterministic-plinko/, and from `npm run preview`.
   */
  base: "./",
});
