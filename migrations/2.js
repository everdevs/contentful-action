module.exports = function runMigration(migration) {
  const post = migration.editContentType("post");
  post
    .createField("year_of_release")
    .name("Release Year")
    .type("Symbol")
    .required(false);
  return;
};
