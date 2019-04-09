

import config from '../config'
import router from '../core/router'

const actions = [];
const navigationGroups = [];

export function addinRegister(addin) {

  // merge config
  if (addin.config) {
    Object.keys(config).forEach(key => {
      config[key] = {
        ...config[key],
        ...addin.config[key]
      };
    });
  }

  // add routes
  if (addin.routes)
    router.addRoutes(addin.routes);

  // add navigation groups
  if (addin.navigation && addin.navigation.groups)
    navigationGroups.push(...addin.navigation.groups)

  // add actions
  if (addin.actions)
    actions.push(...addin.actions);
}

export function addinNavigationGroups() {
  return navigationGroups;
}

export function addinActions() {
  return actions;
}