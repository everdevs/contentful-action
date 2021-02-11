const core = require('@actions/core');
const github = require('@actions/github');

const branchNametoEnvironemntName = (branch) => branch.replace(/[\/_\.]/g, '-');

const getBranchNames = (payload) => {
  const {head: {ref: head}, base: {ref: base}} = payload.pull_request
  return {
    base,
    head,
  }
}

const eventNames = {
  pullRequest: 'pull_request',
};

(async () => {
  const {eventName, payload} = github.context;
  if (eventName === eventNames.pullRequest) {
    console.log(`TYPE: ${eventNames.pullRequest}`);
    const branchNames = getBranchNames(payload);
    const environmentNames = {
      base: branchNametoEnvironemntName(branchNames.base),
      head: branchNametoEnvironemntName(branchNames.head),
    }
    console.log("branchNames:", branchNames);
    console.log("environmentNames", environmentNames);
  }
})();
