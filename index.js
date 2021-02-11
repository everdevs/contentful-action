const core = require('@actions/core');
const github = require('@actions/github');

const cleanBranchName = (branch) => branch.replace('refs/heads/', '').replace(/\//g, '-');
const getBranchNames = () => {
  const branches = {
    head: process.env.GITHUB_HEAD_REF,
    current: process.env.GITHUB_REF
  }
  console.log(JSON.stringify(github.context, null, 8));
  console.log(branches);
}

(async () => {
  getBranchNames();
})()
