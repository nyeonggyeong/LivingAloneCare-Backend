const admin = require('firebase-admin');
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "asia-northeast3" });

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// 1. 재고 기반 레시피 추천
const recommendRecipes = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요한 서비스입니다.');
    }

    const userId = request.auth.uid;

    try {
        // 내 냉장고 재료 가져오기
        const userInventorySnapshot = await db.collection('users').doc(userId).collection('inventory').get();

        if (userInventorySnapshot.empty) {
            return {
                status: "success",
                message: "냉장고에 등록된 재료가 없습니다.",
                recommendations: []
            };
        }

        const myIngredients = userInventorySnapshot.docs.map(doc => {
            const item = doc.data();
            return (item.name || item.ingredientId || "").toString().trim();
        }).filter(name => name.length > 0);

        const recipesSnapshot = await db.collection('recipes').get();

        let recommendations = [];

        recipesSnapshot.forEach(doc => {
            const recipe = doc.data();
            const requiredIngredients = recipe.requiredIngredients || [];

            if (requiredIngredients.length === 0) return;

            let matchedCount = 0;
            let missingIngredients = [];

            requiredIngredients.forEach(req => {
                const reqName = (req.name || req.ingredientId || "").toString().trim();

                // 단순히 내 재료 리스트에 이름이 포함되어 있는지만 확인
                const hasIngredient = myIngredients.some(myIng =>
                    myIng.includes(reqName) || reqName.includes(myIng)
                );

                if (hasIngredient) {
                    matchedCount++;
                } else {
                    missingIngredients.push(reqName);
                }
            });

            // 매칭률 계산
            const matchingRate = (matchedCount / requiredIngredients.length) * 100;

            // 재료가 하나라도 매칭되면(0% 초과) 추천 목록에 추가
            if (matchingRate > 0) {
                recommendations.push({
                    name: recipe.name,
                    recipeId: doc.id,
                    matchingRate: parseFloat(matchingRate.toFixed(1)),
                    cookingTime: recipe.cookingTime,
                    difficulty: recipe.difficulty,
                    tags: recipe.tags,
                    imageUrl: recipe.imageUrl,
                    missingIngredients: missingIngredients,
                });
            }
        });

        // 매칭률 높은 순으로 정렬
        recommendations.sort((a, b) => b.matchingRate - a.matchingRate);

        return {
            status: "success",
            message: `총 ${recommendations.length}개의 추천 레시피를 찾았습니다.`,
            recommendations: recommendations.slice(0, 20) // 상위 20개만 반환
        };

    } catch (error) {
        console.error("에러 발생:", error);
        throw new HttpsError('internal', '서버 에러가 발생했습니다.', error);
    }
});


// 2. 유튜브 영상 검색
const searchRecipeVideos = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const recipeName = request.data.recipeName;

    if (!recipeName) {
        throw new HttpsError('invalid-argument', 'Recipe name is required.');
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