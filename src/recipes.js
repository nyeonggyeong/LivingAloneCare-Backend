// src/recipes.js

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const db = admin.firestore();

// 
// [함수 1] 재고 기반 레시피 추천
//
const recommendRecipes = functions.https.onCall(async (data, context) => {
    // 사용자 인증 확인
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', '인증된 사용자만 접근할 수 있습니다.');
    }
    const userId = context.auth.uid; // 이 ID로 Firestore에서 데이터 조회

    // 데이터 조회
    // (A) 사용자 재고 (Inventory) 불러오기
    const userInventorySnapshot = await db.collection('inventory').where('userId', '==', userId).get();
    const userInventory = userInventorySnapshot.docs.map(doc => doc.data());

    // (B) 레시피 목록 (Recipes) 불러오기
    const recipesSnapshot = await db.collection('recipes').get();
    const allRecipes = recipesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userInventoryMap = {};
    userInventory.forEach(item => {
        // inventory에 저장된 재료 ID(예: '돼지고기')를 키로 사용
        userInventoryMap[item.ingredientId] = { quantity: item.quantity, unit: item.unit };
    });

    // 4. 재고와 레시피를 비교하여 추천 로직 수행
    let recommendations = [];

    allRecipes.forEach(recipe => {
        const requiredCount = recipe.requiredIngredients.length;
        let matchedCount = 0;
        let missingIngredients = [];

        // 이 레시피에 필요한 재료들을 하나씩 확인
        recipe.requiredIngredients.forEach(required => {
            // required.ingredientId (예: '돼지고기')로 사용자 재고 확인
            const userStock = userInventoryMap[required.ingredientId];

            // 재고 보유 및 수량 확인
            if (userStock && userStock.quantity >= required.quantity) {
                matchedCount++; // 재료가 있고 수량도 충분함
            } else {
                // 부족 재료 목록에 재료 이름 추가
                missingIngredients.push(required.name || required.ingredientId);
            }
        });

        // 매칭률 계산
        const matchingRate = requiredCount > 0 ? (matchedCount / requiredCount) * 100 : 0;

        // 매칭률 0% 초과 시 추천 목록에 추가
        if (matchingRate > 0) {
            recommendations.push({
                name: recipe.name,
                recipeId: recipe.id, // Flutter에서 상세 보기 클릭 시 사용할 ID
                matchingRate: parseFloat(matchingRate.toFixed(1)),
                cookingTime: recipe.cookingTime,
                difficulty: recipe.difficulty,
                tags: recipe.tags,
                imageUrl: recipe.imageUrl,
                missingIngredients: missingIngredients, // 부족 재료 목록
            });
        }
    });

    // 매칭률이 높은 순서대로 정렬 (내림차순)
    recommendations.sort((a, b) => b.matchingRate - a.matchingRate);

    // Flutter 앱으로 결과 반환 (상위 10개)
    return {
        status: "success",
        message: `총 ${recommendations.length}개의 추천 레시피를 찾았습니다.`,
        recommendations: recommendations.slice(0, 10)
    };
});

//
// [함수 2] 유튜브 영상 검색
//
const searchRecipeVideos = functions.https.onCall(async (data, context) => {
    // 사용자 인증 확인
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', '인증된 사용자만 접근할 수 있습니다.');
    }

    // Flutter 앱으로부터 레시피 이름 받기
    const recipeName = data.recipeName;
    if (!recipeName) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipe name is required.');
    }

    // 유튜브 검색 결과 페이지 URL 생성
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(recipeName + ' 레시피')}`;

    // Flutter 앱으로 URL만 반환
    return {
        status: "success",
        youtubeSearchUrl: youtubeSearchUrl
    };
});

module.exports = {
    recommendRecipes,
    searchRecipeVideos
};