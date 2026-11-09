/**
 * Licensed documentary/illustrative photos, mapped by PUBLIC question id.
 * No answers, scores, passwords or private JSON are included.
 * Original media are credited from their Wikimedia Commons file pages.
 * Some Congress-related photos are context illustrations, not literal photos
 * of the historical event mentioned in the question.
 */
export const QUESTION_PHOTOS = {
  "r1": {
    "file": "The Ba Dinh meeting-hall.jpg",
    "caption": "Không gian hội nghị — minh họa chủ đề Đại hội XI",
    "credit": "Casablanca1911"
  },
  "r2": {
    "file": "Books in Library.jpg",
    "caption": "Sách và tư liệu nghiên cứu văn kiện",
    "credit": "MBERABAHIZI"
  },
  "r3": {
    "file": "Construction of Núi Đọ Bridge.jpg",
    "caption": "Hạ tầng giao thông Việt Nam",
    "credit": "Wikimedia Commons"
  },
  "r4": {
    "file": "Party Congress Dai Hoi XII in the streets of Hanoi 01.jpg",
    "caption": "Không khí cổ động Đại hội XII tại Hà Nội",
    "credit": "Vuong Tri Binh"
  },
  "r5": {
    "file": "Communist Party of Vietnam 12th party congress large propaganda sign 1.jpg",
    "caption": "Hình ảnh cổ động Đại hội XII",
    "credit": "Vuong Tri Binh"
  },
  "r6": {
    "file": "Paddy field, Vietnam.jpg",
    "caption": "Đồng ruộng Việt Nam — tài nguyên và môi trường",
    "credit": "UN-CECAR"
  },
  "r7": {
    "file": "Hội trường Diên Hồng, Quốc hội Việt Nam.jpg",
    "caption": "Không gian hội nghị đại biểu — ảnh minh họa",
    "credit": "Wikimedia Commons"
  },
  "r8": {
    "file": "Suspension bridge Vietnam.jpg",
    "caption": "Kết cấu hạ tầng — cầu giao thông tại Việt Nam",
    "credit": "Chris Feser"
  },
  "f1": {
    "file": "Dai Hoi XII party congress propaganda posters with Ho Chi Minh, Hanoi.jpg",
    "caption": "Tư liệu cổ động Đại hội XII",
    "credit": "Vuong Tri Binh"
  },
  "f2": {
    "file": "Old Books in the library.jpg",
    "caption": "Tài liệu và nghiên cứu văn kiện",
    "credit": "InfoSources"
  },
  "f3": {
    "file": "HCMC Two students studying.JPG",
    "caption": "Sinh viên học tập và phát triển nhân lực",
    "credit": "Dragfyre"
  },
  "f4": {
    "file": "Party congress 12 of the CPVN.jpg",
    "caption": "Tư liệu cổ động Đại hội XII",
    "credit": "Vuong Tri Binh"
  },
  "f5": {
    "file": "Market people on street in Vietnam.jpg",
    "caption": "Đời sống kinh tế và thương mại ở Việt Nam",
    "credit": "Peter van der Sluijs"
  },
  "f6": {
    "file": "Mercedes-Benz-Vietnam factory workers management.jpg",
    "caption": "Sản xuất công nghiệp tại Việt Nam",
    "credit": "namisito"
  },
  "g1": {
    "file": "Street flood in Saigon (10728572006).jpg",
    "caption": "Đường phố ngập nước sau mưa lớn",
    "credit": "Bem photography"
  },
  "g2": {
    "file": "Plastic recycler.jpg",
    "caption": "Thu gom và tái chế rác thải nhựa",
    "credit": "Wikimedia Commons"
  },
  "g3": {
    "file": "Parched rice field Can Tho.JPG",
    "caption": "Đồng ruộng chịu ảnh hưởng hạn hán ở Cần Thơ",
    "credit": "Dragfyre"
  },
  "g4": {
    "file": "Recycling Bins.jpg",
    "caption": "Thùng phân loại và thu gom rác",
    "credit": "Si Griffiths"
  },
  "g5": {
    "file": "Intel Solar Installation Vietnam.jpg",
    "caption": "Hệ thống pin mặt trời tại Việt Nam",
    "credit": "Intel Free Press"
  },
  "g6": {
    "file": "Typhoon Noru makes landfall in Vietnam.jpg",
    "caption": "Ảnh vệ tinh bão Noru ảnh hưởng đến Việt Nam",
    "credit": "Copernicus Sentinel-3"
  }
};

/** Use Commons' file redirect service; never build arbitrary remote URLs from JSON. */
function photoUrl(file) {
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/'
    + encodeURIComponent(file.replaceAll(' ','_')) + '?width=1000';
}
export function getQuestionPhoto(question) {
  const record = question && QUESTION_PHOTOS[question.id];
  if (!record) return null;
  return {
    id:question.id,
    url:photoUrl(record.file),
    source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(record.file.replaceAll(' ','_')),
    alt:record.caption,
    credit:record.credit,
    fallback:'./art/photo-fallback.svg'
  };
}
