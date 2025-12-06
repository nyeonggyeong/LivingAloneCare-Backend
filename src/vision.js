const { onCall, HttpsError } = require("firebase-functions/v2/https");
const vision = require('@google-cloud/vision');

const client = new vision.ImageAnnotatorClient();

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
            const [result] = await client.labelDetection(buffer); // 라벨 감지 (사물 인식)

            const labels = result.labelAnnotations;

            const descriptions = labels.map(label => label.description).slice(0, 5);

            return {
                status: "success",
                items: descriptions
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