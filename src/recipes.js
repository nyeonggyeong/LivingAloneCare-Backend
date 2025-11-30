const admin = require('firebase-admin');
const functions = require('firebase-functions');

const db = admin.firestore();


// 재고 기반 레시피 추천
const recommendRecipes = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', '로그인이 필요한 서비스입니다.');
    }

    const userId = context.auth.uid;

    try {
        const userInventorySnapshot = await db.collection('users').doc(userId).collection('inventory').get();

        if (userInventorySnapshot.empty) {
            return {
                status: "success",
                message: "냉장고에 등록된 재료가 없습니다.",
                recommendations: []
            };
        }

        const userInventory = userInventorySnapshot.docs.map(doc => doc.data());

        const recipesSnapshot = await db.collection('recipes').get();
        const allRecipes = recipesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const userInventoryMap = {};
        userInventory.forEach(item => {
            const qty = Number(item.quantity) || 0;
            if (item.ingredientId) {
                userInventoryMap[item.ingredientId] = { quantity: qty, unit: item.unit };
            }
        });

        let recommendations = [];

        allRecipes.forEach(recipe => {
            if (!recipe.requiredIngredients) return;

            const requiredCount = recipe.requiredIngredients.length;
            let matchedCount = 0;
            let missingIngredients = [];

            recipe.requiredIngredients.forEach(required => {
                const userStock = userInventoryMap[required.ingredientId];
                const requiredQty = Number(required.quantity) || 0;

                if (userStock && userStock.quantity >= requiredQty) {
                    matchedCount++;
                } else {
                    missingIngredients.push(required.name || required.ingredientId);
                }
            });

            const matchingRate = requiredCount > 0 ? (matchedCount / requiredCount) * 100 : 0;

            if (matchingRate > 0) {
                recommendations.push({
                    name: recipe.name,
                    recipeId: recipe.id,
                    matchingRate: parseFloat(matchingRate.toFixed(1)),
                    cookingTime: recipe.cookingTime,
                    difficulty: recipe.difficulty,
                    tags: recipe.tags,
                    imageUrl: recipe.imageUrl,
                    missingIngredients: missingIngredients,
                });
            }
        });

        recommendations.sort((a, b) => b.matchingRate - a.matchingRate);

        return {
            status: "success",
            message: `총 ${recommendations.length}개의 추천 레시피를 찾았습니다.`,
            recommendations: recommendations.slice(0, 10)
        };

    } catch (error) {
        console.error("에러 발생:", error);
        throw new functions.https.HttpsError('internal', '서버 에러가 발생했습니다.', error);
    }
});


// 유튜브 영상 검색

const searchRecipeVideos = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const recipeName = data.recipeName;
    if (!recipeName) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipe name is required.');
    }

    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(recipeName + ' 레시피')}`;

    return {
        status: "success",
        youtubeSearchUrl: youtubeSearchUrl
    };
});

module.exports = {
    recommendRecipes,
    searchRecipeVideos
};