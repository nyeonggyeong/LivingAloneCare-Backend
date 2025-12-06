const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

const recipes = require('./src/recipes');
const alerts = require('./src/alerts');
const vision = require('./src/vision');

exports.recommendRecipes = recipes.recommendRecipes;
exports.searchRecipeVideos = recipes.searchRecipeVideos;
exports.scheduleExpiryCheck = alerts.scheduleExpiryCheck;
exports.analyzeImage = vision.analyzeImage;