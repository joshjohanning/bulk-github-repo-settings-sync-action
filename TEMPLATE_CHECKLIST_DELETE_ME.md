# Template Customization Checklist

Use this checklist when setting up your new GitHub Action from this template:

## Required Changes

- [ ] **Update `package.json`**
  - [ ] Change `name` from "your-action-name" to your actual action name
  - [ ] Update `description` with your action's purpose
  - [ ] Change `author` information (name, email, url)
  - [ ] Update `homepage`, `repository`, and `bugs` URLs
  - [ ] Set appropriate `version` (start with 1.0.0)

- [ ] **Update `action.yml`**
  - [ ] Change `name` to your action's name
  - [ ] Update `description` with what your action does
  - [ ] Modify `inputs` for your action's requirements
  - [ ] Update `outputs` for what your action returns
  - [ ] Choose appropriate `branding` icon and color

- [ ] **Update `README.md`**
  - [ ] Change title to your action name
  - [ ] Update description and feature list
  - [ ] Update usage examples with your action's inputs/outputs
  - [ ] Add your specific documentation
  - [ ] Update the coverage badge path if needed

- [ ] **Customize `src/index.js`**
  - [ ] Replace the Hello World logic with your action's functionality
  - [ ] Update input handling for your specific inputs
  - [ ] Implement your core action logic
  - [ ] Update output setting for your specific outputs
  - [ ] Update error handling as needed

- [ ] **Update tests in `__tests__/index.test.js`**
  - [ ] Replace Hello World tests with tests for your action
  - [ ] Update mock data and expectations
  - [ ] Add tests for your specific functionality
  - [ ] Ensure good test coverage

## Optional Changes

- [ ] **Update GitHub workflows** (if needed)
  - [ ] Modify `.github/workflows/ci.yml` for specific CI needs
  - [ ] Update `.github/workflows/publish.yml` publishing settings
  - [ ] Add any additional workflow files your action needs

- [ ] **Dependencies**
  - [ ] Remove `@octokit/rest` if you don't need GitHub API access
  - [ ] Add any additional dependencies your action requires
  - [ ] Update dev dependencies as needed

- [ ] **Configuration files**
  - [ ] Adjust ESLint rules in `eslint.config.js` if needed
  - [ ] Modify Jest configuration in `jest.config.js` if needed
  - [ ] Update Prettier settings if needed

- [ ] **Documentation**
  - [ ] Update `.github/copilot-instructions.md` for your project
  - [ ] Add any additional documentation files
  - [ ] Consider adding examples or tutorials

## After Customization

- [ ] **Test everything works**
  - [ ] Run `npm install`
  - [ ] Run `npm test` to ensure tests pass
  - [ ] Run `npm run lint` to check code quality
  - [ ] Run `npm run package` to verify bundling works
  - [ ] Test your action locally if possible

- [ ] **Clean up**
  - [ ] Delete this `TEMPLATE_CHECKLIST.md` file
  - [ ] Commit your changes
  - [ ] Create your first release

- [ ] **Set up publishing** (optional)
  - [ ] Configure branch protection rules
  - [ ] Set up automated releases
  - [ ] Publish to GitHub Marketplace

## Need Help?

- Check the [GitHub Actions documentation](https://docs.github.com/en/actions)
- Look at the existing code and tests for examples
- The `.github/copilot-instructions.md` file contains development guidelines
