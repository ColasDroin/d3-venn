/**
 * getSet creates a getter/setter function for a re-usable D3.js component.
 *
 * @method getSet
 * @param  {string}   option    - name of the property
 * @param  {function} component - the parent object or "this"
 *
 * @return {mixed} The value of the option or the component.
 */

export function getSet(option, component) {
  return function (_) {
    if (!arguments.length) {
      return this[option];
    }
    this[option] = _;
    return component;
  };
}

/**
 * Applies a set of options (key-value pairs) to a D3 component by calling
 * component[key](options[key]) if that method exists.
 */
export function applier(component, options) {
  for (let key in options) {
    if (typeof component[key] === "function") {
      component[key](options[key]);
    }
  }
  return component;
}

/**
 * Binds a set of key/value pairs as getter/setter methods on a component.
 * e.g. component.someProp(value)
 */
export function binder(component, options) {
  for (let key in options) {
    if (!component[key]) {
      component[key] = getSet(key, component).bind(options);
    }
  }
}
