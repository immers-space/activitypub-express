'use strict'
const pub = require('pub')
const net = require('net')
const defaultStore = require('store')
module.exports = function (settings) {
  const apex = function (req, res, next) {
    req.apex = apex
    next()
  }
  apex.pub = pub
  apex.net = net
  apex.store = settings.store || defaultStore
  return apex
}
