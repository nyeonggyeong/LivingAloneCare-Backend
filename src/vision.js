const { onCall, HttpsError } = require("firebase-functions/v2/https");
const vision = require('@google-cloud/vision');
const { Translate } = require('@google-cloud/translate').v2;

const visionClient = new vision.ImageAnnotatorClient();
const translateClient = new Translate();

const IGNORED_LABELS = [
    'food', 'fruit', 'vegetable', 'produce', 'ingredient', 'natural foods', 'whole food', 'local food', 'vegan nutrition', 'superfood', 'dish', 'cuisine',
    'orange', 'yellow', 'red', 'green', 'blue', 'color', 'orange color',
    'tableware', 'plate', 'dishware', 'recipe', 'serveware'
];

const analyzeImage = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
        }
        const base64Image = request.data.image;
        if (!base64Image) {
            throw new HttpsError('invalid-argument', '이미지 데이터가 없습니다.');
        }

        try {
            const buffer = Buffer.from(base64Image, 'base64');
            const [result] = await visionClient.labelDetection(buffer);
            const labels = result.labelAnnotations;

            if (!labels || labels.length === 0) {
                return { status: "success", items: [] };
            }

            // 2. 필터링 로직 (아주 잘 짜셨습니다!)
            let bestLabel = "";

            for (const label of labels) {
                const text = label.description.toLowerCase();

                if (!IGNORED_LABELS.includes(text) && label.score > 0.7) {
                    bestLabel = label.description;
                    break;
                }
            }

            if (!bestLabel) {
                bestLabel = labels[0].description;
            }

            console.log(`AI가 선택한 영어 단어: ${bestLabel}`);

            let translatedText = bestLabel;

            try {
                const [translation] = await translateClient.translate(bestLabel, 'ko');
                translatedText = translation;
            } catch (transError) {
                console.error("번역 실패:", transError);
            }

            console.log(`최종 결과: ${bestLabel} -> ${translatedText}`);

            return {
                status: "success",
                items: [translatedText]
            };

        } catch (error) {
            console.error("Vision API Error:", error);
            throw new HttpsError('internal', '이미지 분석 중 오류가 발생했습니다.', error);
        }
    }
);

module.exports = {
    analyzeImage
};