'use strict';
const fs = require('fs');
const path = require('path');

module.exports = () => fs.readFileSync(path.join(__dirname, 'deers.txt'), 'utf8')
	.replace(/\n$/, '').split('\n\n\n');
