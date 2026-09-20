const base = require("./release.config.cjs");

/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  ...base,
  branches: [{ name: "master", prerelease: "staging" }],
  plugins: base.plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "@semantic-release/github") {
      return [
        "@semantic-release/github",
        {
          ...plugin[1],
          draftRelease: true,
          prerelease: "staging",
        },
      ];
    }
    return plugin;
  }),
};
