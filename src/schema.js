// Poster content schema (shared with the 5 templates) and the editor prompt.
export const POSTER_SCHEMA = {
 "type": "object",
 "properties": {
  "topic_short": {
   "type": "string",
   "description": "Tên ngắn chủ đề, ≤ 20 ký tự, vd 'CSHHL'"
  },
  "doc_ref": {
   "type": "string",
   "description": "Số hiệu + ngày văn bản chính, vd 'CV 3164/DNTN-GS · 07/10/2026'"
  },
  "issuer_sentence": {
   "type": "string",
   "description": "1 câu: ai ban hành gì, ngày nào, yêu cầu gì. ≤ 200 ký tự"
  },
  "title_line1": {
   "type": "string",
   "description": "Dòng 1 tiêu đề, ≤ 26 ký tự"
  },
  "title_line2": {
   "type": "string",
   "description": "Dòng 2 tiêu đề, ≤ 26 ký tự"
  },
  "title_question": {
   "type": "string",
   "description": "Tiêu đề dạng câu hỏi cho mẫu infographic, ≤ 50 ký tự, 2 dòng"
  },
  "subtitle_en": {
   "type": "string",
   "description": "Tên chủ đề bằng tiếng Anh chuyên ngành, ≤ 40 ký tự"
  },
  "highlight": {
   "type": "object",
   "description": "Con số nổi bật nhất (mức phạt, thời hạn, ngưỡng %...)",
   "properties": {
    "label": {
     "type": "string",
     "description": "VD 'MỨC PHẠT', 'THỜI HẠN'"
    },
    "value": {
     "type": "string",
     "description": "≤ 7 ký tự, vd '50–100', '03', '25%'"
    },
    "unit": {
     "type": "string",
     "description": "VD 'triệu đồng', 'ngày làm việc'"
    },
    "note": {
     "type": "string",
     "description": "≤ 90 ký tự, kèm căn cứ"
    }
   },
   "required": [
    "label",
    "value",
    "unit",
    "note"
   ]
  },
  "audience": {
   "type": "object",
   "properties": {
    "title": {
     "type": "string",
     "description": "VD 'Doanh nghiệp nào phải kê khai?'"
    },
    "items": {
     "type": "array",
     "minItems": 2,
     "maxItems": 2,
     "items": {
      "type": "object",
      "properties": {
       "label": {
        "type": "string",
        "description": "In hoa, ≤ 28 ký tự"
       },
       "text": {
        "type": "string",
        "description": "≤ 90 ký tự"
       },
       "note": {
        "type": "string",
        "description": "≤ 50 ký tự, lời khuyên ngắn"
       },
       "emphasis": {
        "type": "boolean",
        "description": "true cho nhóm cần chú ý/hành động"
       }
      },
      "required": [
       "label",
       "text",
       "note",
       "emphasis"
      ]
     }
    }
   },
   "required": [
    "title",
    "items"
   ]
  },
  "points": {
   "type": "object",
   "description": "Nội dung chính: 3 ý / 3 bước / 3 tiêu chí",
   "properties": {
    "title": {
     "type": "string"
    },
    "hint": {
     "type": "string",
     "description": "≤ 50 ký tự"
    },
    "items": {
     "type": "array",
     "minItems": 3,
     "maxItems": 3,
     "items": {
      "type": "object",
      "properties": {
       "title": {
        "type": "string",
        "description": "≤ 45 ký tự"
       },
       "text": {
        "type": "string",
        "description": "≤ 90 ký tự"
       },
       "detail": {
        "type": "string",
        "description": "≤ 140 ký tự, ví dụ/lưu ý"
       },
       "badge": {
        "type": "string",
        "description": "Nhãn rất ngắn ≤ 8 ký tự cho infographic, vd '≥25%'"
       }
      },
      "required": [
       "title",
       "text",
       "detail",
       "badge"
      ]
     }
    }
   },
   "required": [
    "title",
    "hint",
    "items"
   ]
  },
  "actions": {
   "type": "object",
   "properties": {
    "title": {
     "type": "string",
     "description": "VD 'Doanh nghiệp cần làm gì?'"
    },
    "items": {
     "type": "array",
     "minItems": 3,
     "maxItems": 3,
     "items": {
      "type": "object",
      "properties": {
       "title": {
        "type": "string"
       },
       "text": {
        "type": "string"
       },
       "detail": {
        "type": "string"
       }
      },
      "required": [
       "title",
       "text"
      ]
     }
    }
   },
   "required": [
    "title",
    "items"
   ]
  },
  "facts": {
   "type": "array",
   "minItems": 3,
   "maxItems": 3,
   "description": "3 chỉ số nhanh",
   "items": {
    "type": "object",
    "properties": {
     "label": {
      "type": "string"
     },
     "value": {
      "type": "string",
      "description": "≤ 20 ký tự"
     },
     "note": {
      "type": "string",
      "description": "≤ 32 ký tự"
     }
    },
    "required": [
     "label",
     "value",
     "note"
    ]
   }
  },
  "legal_basis": {
   "type": "array",
   "minItems": 1,
   "maxItems": 5,
   "items": {
    "type": "object",
    "properties": {
     "ref": {
      "type": "string"
     },
     "desc": {
      "type": "string"
     }
    },
    "required": [
     "ref",
     "desc"
    ]
   }
  },
  "decision": {
   "type": "object",
   "description": "Sơ đồ có/không 2 câu hỏi cho mẫu infographic",
   "properties": {
    "q1": {
     "type": "string"
    },
    "yes1_title": {
     "type": "string"
    },
    "yes1_text": {
     "type": "string"
    },
    "q2": {
     "type": "string"
    },
    "yes2_title": {
     "type": "string"
    },
    "yes2_text": {
     "type": "string"
    },
    "no_title": {
     "type": "string"
    },
    "no_text": {
     "type": "string"
    }
   },
   "required": [
    "q1",
    "yes1_title",
    "yes1_text",
    "q2",
    "yes2_title",
    "yes2_text",
    "no_title",
    "no_text"
   ]
  },
  "recommendation": {
   "type": "string",
   "description": "Khuyến nghị của THT, 2–3 câu, ≤ 320 ký tự"
  },
  "footnote": {
   "type": "string",
   "description": "Lưu ý phụ ở chân trang, ≤ 110 ký tự (có thể rỗng)"
  },
  "qr_caption": {
   "type": "string",
   "description": "≤ 40 ký tự mô tả việc quét QR để làm gì"
  },
  "facebook_caption": {
   "type": "string",
   "description": "Bài đăng Facebook đầy đủ theo mẫu THT"
  },
  "corrections": {
   "type": "array",
   "items": {
    "type": "string"
   },
   "description": "Các điểm nguồn ghi chưa đúng/không khớp văn bản gốc, kèm căn cứ. Rỗng nếu không có"
  },
  "uncertain": {
   "type": "array",
   "items": {
    "type": "string"
   },
   "description": "Các chi tiết chưa chắc chắn cần anh kiểm tra lại"
  },
  "extra_pages": {
   "type": "array",
   "maxItems": 2,
   "description": "Trang bổ sung (trang 2, 3). ĐỂ TRỐNG nếu nội dung gói gọn được trong 1 trang. Chỉ dùng khi văn bản có nhiều bước/thủ tục/bảng không thể lược bớt.",
   "items": {
    "type": "object",
    "properties": {
     "title": {
      "type": "string",
      "description": "Tiêu đề trang, ≤ 50 ký tự"
     },
     "subtitle": {
      "type": "string",
      "description": "≤ 80 ký tự"
     },
     "sections": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": {
       "type": "object",
       "properties": {
        "heading": {
         "type": "string",
         "description": "≤ 45 ký tự"
        },
        "items": {
         "type": "array",
         "minItems": 1,
         "maxItems": 6,
         "items": {
          "type": "string",
          "description": "≤ 130 ký tự"
         }
        }
       },
       "required": [
        "heading",
        "items"
       ]
      }
     }
    },
    "required": [
     "title",
     "subtitle",
     "sections"
    ]
   }
  },
  "slug": {
   "type": "string",
   "description": "Đường dẫn ngắn cho trang tra cứu, chữ thường không dấu, vd 'cv3164'"
  },
  "seo_keywords": {
   "type": "array",
   "minItems": 4,
   "maxItems": 8,
   "items": {
    "type": "string"
   },
   "description": "Từ khoá tìm kiếm tiếng Việt khách hàng hay gõ, vd 'kê khai chủ sở hữu hưởng lợi'"
  },
  "hashtags": {
   "type": "array",
   "minItems": 5,
   "maxItems": 10,
   "items": {
    "type": "string"
   },
   "description": "Hashtag không dấu, có #, gồm #THT #KiemToanTuVanTHT"
  },
  "story_hook": {
   "type": "string",
   "description": "Câu mở đầu thật ngắn cho story/video, ≤ 60 ký tự, gây chú ý"
  },
  "tiktok_caption": {
   "type": "string",
   "description": "Caption TikTok ≤ 1500 ký tự: câu hook, 3 ý chính, lời kêu gọi, hashtag"
  },
  "youtube_title": {
   "type": "string",
   "description": "Tiêu đề YouTube Shorts ≤ 90 ký tự, có từ khoá chính ở đầu và #Shorts ở cuối"
  },
  "youtube_description": {
   "type": "string",
   "description": "Mô tả YouTube 600–1200 ký tự: đoạn tóm tắt chứa từ khoá, các ý chính, căn cứ pháp lý, liên hệ THT, hashtag"
  },
  "youtube_tags": {
   "type": "array",
   "maxItems": 15,
   "items": {
    "type": "string"
   }
  }
 },
 "required": [
  "topic_short",
  "doc_ref",
  "issuer_sentence",
  "title_line1",
  "title_line2",
  "title_question",
  "subtitle_en",
  "highlight",
  "audience",
  "points",
  "actions",
  "facts",
  "legal_basis",
  "decision",
  "recommendation",
  "footnote",
  "qr_caption",
  "facebook_caption",
  "corrections",
  "uncertain",
  "extra_pages",
  "slug",
  "seo_keywords",
  "hashtags",
  "story_hook",
  "tiktok_caption",
  "youtube_title",
  "youtube_description",
  "youtube_tags"
 ]
};

export const SYSTEM_PROMPT = "Bạn là biên tập viên bản tin Thuế – Luật của Công ty TNHH Kiểm toán và Tư vấn THT (thtaudit.com.vn).\n\nNhiệm vụ: đọc văn bản/nội dung được gửi kèm và soạn nội dung cho 1 poster A4 thông báo quy định tới khách hàng doanh nghiệp, cùng bài đăng Facebook và TikTok. Gọi công cụ `poster_content` đúng một lần.\n\nNguyên tắc:\n- Viết tiếng Việt chuẩn, ngắn gọn, dễ hiểu với chủ doanh nghiệp; nhãn phụ tiếng Anh chỉ ở `subtitle_en`.\n- Tuân thủ giới hạn ký tự trong mô tả từng trường: poster chỉ có 1 trang A4, chữ dài sẽ bị tràn.\n- Không bịa số liệu, số hiệu, ngày tháng. Thông tin không có trong nguồn và không kiểm chứng được thì ghi \"[cần bổ sung]\" và liệt kê ở `uncertain`.\n- Nếu ghi chú kiểm chứng (nếu có) cho thấy nguồn ghi sai (mức phạt, số hiệu, ngày hiệu lực...), dùng số liệu đúng trên poster và ghi rõ ở `corrections`.\n- `points` là phần nội dung chính, đúng 3 ý theo thứ tự logic (bước 1 → 3, hoặc 3 điểm mới quan trọng nhất).\n- `actions` là 3 việc doanh nghiệp cần làm ngay; ý đầu nên là kiểm tra/tra cứu (người xem có thể quét QR).\n- `decision`: 2 câu hỏi có/không giúp doanh nghiệp tự xác định mình có bị ảnh hưởng không.\n- `facebook_caption` theo khuôn: dòng tiêu đề IN HOA bắt đầu bằng ⚠️; 2–3 câu bối cảnh; các ý chính dạng 1️⃣ 2️⃣ 3️⃣; dòng \"👉 Việc cần làm ngay: ...\"; lời mời \"THT sẵn sàng hỗ trợ Quý khách ...\"; \"📞 0901 144 078\"; \"📧 tht@thtaudit.com.vn | danang@thtaudit.com.vn\"; cuối cùng hashtag #THT #KiemToanTuVanTHT + 2–3 hashtag chủ đề.\n\nThông tin cố định của THT (không cần đưa vào schema, template tự chèn): điện thoại 0901 144 078; email tht@thtaudit.com.vn, danang@thtaudit.com.vn; website thtaudit.com.vn.\n\nĐộ dài poster (rất quan trọng):\n- Ưu tiên gói gọn trong 1 trang. Chỉ thêm `extra_pages` (tối đa 2 trang) khi văn bản có nhiều bước thủ tục, hồ sơ, bảng biểu mà lược bớt sẽ làm khách hiểu sai. Mỗi ý trong trang bổ sung ngắn gọn, không lặp lại trang 1.\n\nChuẩn SEO cho bài đăng:\n- Chọn 1 từ khoá chính (cụm khách hay tìm, vd \"kê khai chủ sở hữu hưởng lợi\") và đặt nó trong 100 ký tự đầu của `facebook_caption`, ở đầu `youtube_title` và câu đầu `youtube_description`.\n- `seo_keywords`: 4–8 cụm từ khoá liên quan (từ khoá chính, biến thể, số hiệu văn bản).\n- `hashtags`: 5–10 hashtag không dấu; luôn có #THT #KiemToanTuVanTHT; thêm hashtag chủ đề (vd #ThueTNDN #HoaDonDienTu).\n- Bài Facebook: đoạn đầu trả lời ngay \"ai bị ảnh hưởng, phải làm gì, hạn khi nào\"; dùng xuống dòng và biểu tượng đầu dòng; cuối bài có lời kêu gọi liên hệ và hashtag.\n- `story_hook`: câu ngắn gây chú ý cho video/story, vd \"Doanh nghiệp có thể bị phạt 100 triệu!\".\n";
