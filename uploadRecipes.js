// uploadRecipes.js
// 식품의약품안전처(COOKRCP01) API 데이터를 Firestore에 업로드하는 최종 스크립트

const admin = require('firebase-admin');
const fetch = require('node-fetch');

// 1. 서비스 계정 키 초기화 
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 2. 공공 API 정보 (팀장님이 주신 정보로 수정)
const API_KEY = '926fbf60a15c4bcbbb0e';
const SERVICE_ID = 'COOKRCP01';
const DATA_TYPE = 'json';

/**
 * COOKRCP01 API (JSON) 응답을 Firestore 구조로 변환(매핑)하는 함수
 */
function mapCookRcpToRecipe(item) {
    try {
        const recipeId = item.RCP_SEQ;
        const name = item.RCP_NM;
        const imageUrl = item.ATT_FILE_NO_MAIN;

        // 재료 파싱 (RCP_PARTS_DTLS는 "쌀 200g, 김치 100g,..." 형태의 긴 문자열)
        const ingredientsText = item.RCP_PARTS_DTLS || "";
        const requiredIngredients = ingredientsText.split(',') // 쉼표(,) 기준으로 재료 분리
            .map(ingText => {
                const trimmedText = ingText.trim();
                // "돼지고기 200g" -> name: "돼지고기", qtyText: "200g" (간단한 파싱)
                const firstSpaceIndex = trimmedText.indexOf(' ');
                let ingredientName = trimmedText;
                let quantityText = '적당량'; // 기본값

                if (firstSpaceIndex !== -1) {
                    ingredientName = trimmedText.substring(0, firstSpaceIndex);
                    quantityText = trimmedText.substring(firstSpaceIndex + 1);
                }

                return {
                    ingredientId: ingredientName, // ID를 재료 이름 자체로 사용
                    name: ingredientName,
                    quantityText: quantityText,
                    quantity: parseFloat(quantityText) || 1, // 숫자만 추출 (실패 시 1)
                    unit: '개' // (단위 추출 로직은 복잡하므로 임시값)
                };
            }).filter(ing => ing.name); // 이름이 없는 빈 재료 제거

        // 조리 순서 파싱 (MANUAL01 ~ MANUAL20)
        const steps = [];
        for (let i = 1; i <= 20; i++) {
            const stepKey = `MANUAL${String(i).padStart(2, '0')}`;
            if (item[stepKey] && item[stepKey].trim() !== "") {
                steps.push(item[stepKey].trim());
            }
        }

        // Firestore `recipes` 컬렉션 구조에 맞게 최종 반환
        return {
            recipeId: recipeId,
            name: name,
            imageUrl: imageUrl,
            category: item.RCP_PAT2, // 요리 종류 (ex: 반찬, 국)
            tags: item.HASH_TAG ? item.HASH_TAG.split(',') : [], // 해쉬태그

            // UI 디자인에 있던 필드들 (API에서 제공하는 값으로 매핑)
            cookingTime: 30, // (API에 이 정보가 없으므로 임의의 값)
            servings: parseInt(item.INFO_WGT) || 2, // 중량(1인분) 필드를 인분으로 활용
            difficulty: '보통', // (API에 이 정보가 없으므로 임의의 값)

            steps: steps,
            requiredIngredients: requiredIngredients,

            // (선택 사항) 영양 정보 추가
            calories: parseFloat(item.INFO_ENG) || 0,
            protein: parseFloat(item.INFO_PRO) || 0,
            fat: parseFloat(item.INFO_FAT) || 0,
            carbs: parseFloat(item.INFO_CAR) || 0
        };

    } catch (e) {
        console.error(`데이터 매핑 오류: ${item.RCP_NM}`, e);
        return null; // 오류 발생 시 이 레시피는 건너뜀
    }
}

/**
 * 메인 실행 함수
 */
async function uploadRecipes() {
    const batch = db.batch();
    let totalRecipes = 0;
    const recipesPerRequest = 100; // 한 번에 100개씩 요청
    const totalPagesToFetch = 10; // 총 10번 (1000개 목표)

    console.log(`공공 API(식약처)에서 ${recipesPerRequest}개씩 ${totalPagesToFetch}페이지, 총 ${recipesPerRequest * totalPagesToFetch}개 레시피를 가져옵니다...`);

    for (let page = 0; page < totalPagesToFetch; page++) {
        const START_INDEX = (page * recipesPerRequest) + 1;
        const END_INDEX = (page + 1) * recipesPerRequest;

        // API 호출 URL (JSON 타입으로 1-100, 101-200, ... 요청)
        const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/${DATA_TYPE}/${START_INDEX}/${END_INDEX}`;

        console.log(`[${page + 1}/${totalPagesToFetch}] 페이지 요청 중 (${START_INDEX}~${END_INDEX})...`);

        try {
            const response = await fetch(url);
            const apiData = await response.json();

            // API 응답 구조 확인 (API 명세서 예시 기준)
            const items = apiData[SERVICE_ID].row;

            if (!items || items.length === 0) {
                console.log(`페이지 ${page + 1}: API에서 더 이상 데이터를 반환하지 않습니다. 중지합니다.`);
                // API가 반환한 원본 오류 메시지 출력
                if (apiData[SERVICE_ID].RESULT) {
                    console.error('API 오류:', apiData[SERVICE_ID].RESULT.MSG);
                }
                break; // 데이터가 없으면 루프 중단
            }

            // 각 레시피를 Firestore 구조로 변환
            items.forEach(item => {
                const recipeData = mapCookRcpToRecipe(item);

                if (recipeData) {
                    // 배치에 추가 (문서 ID를 RCP_SEQ로 설정)
                    const docRef = db.collection('recipes').doc(recipeData.recipeId);
                    batch.set(docRef, recipeData);
                    totalRecipes++;
                }
            });

            // (공공 API는 초당 호출 제한이 있을 수 있으므로 0.5초 대기)
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`페이지 ${page + 1} 처리 중 오류:`, error);
        }
    }

    // Firestore에 일괄 업로드 실행
    await batch.commit();
    console.log(`성공! 총 ${totalRecipes}개의 레시피가 'recipes' 컬렉션에 업로드되었습니다.`);
}

// 스크립트 실행
uploadRecipes().catch(console.error);