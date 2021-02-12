module.exports = function runMigration(migration) {
  const post = migration.editContentType("post");
  post.moveField('year_of_release').afterField('title');
  return;
};
