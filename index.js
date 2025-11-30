const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

const recipes = require('./src/recipes');

exports.recommendRecipes = recipes.recommendRecipes;
exports.searchRecipeVideos = recipes.searchRecipeVideos;