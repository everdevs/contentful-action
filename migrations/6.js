module.exports = function runMigration(migration) {
  const post = migration.editContentType("post");
  post
    .editField("year_of_release", { name: "release_year" })
  return;
};
