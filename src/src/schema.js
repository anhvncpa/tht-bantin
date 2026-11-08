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
   "description": "Caption TikTok chuẩn SEO (tìm kiếm trên TikTok), 300–700 ký tự, xuống dòng rõ ràng: dòng 1 là câu hook ≤ 80 ký tự chứa từ khoá chính (tên văn bản/chủ đề, vd \"Thuế TNCN 2026\") + 1 emoji; tiếp theo 3 ý chính dạng gạch đầu dòng có emoji (✅/📌/⚠️), mỗi ý ≤ 90 ký tự, lồng tự nhiên 2–3 từ khoá phụ mà doanh nghiệp hay tìm (vd: kế toán, quyết toán thuế, hạn nộp, mức phạt); 1 dòng hạn/mốc thời gian nếu có; 1 câu kêu gọi: \"Lưu lại & theo dõi THT để cập nhật luật mới mỗi tuần\" và \"Cần tư vấn: TP.HCM (+84) 28 3517 8796 · Đà Nẵng (+84) 901 144 078\"; dòng cuối 5–7 hashtag không dấu: 2–3 hashtag rộng (#thue #ketoan #doanhnghiep), 2–3 hashtag theo chủ đề văn bản, và #THT #KiemToanTuVanTHT. Không dùng hashtag rác (#fyp #xuhuong)."
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
  },
  "en": {
   "type": "object",
   "description": "Bản tiếng Anh song song cho poster song ngữ và bài Facebook. Dịch sát nghĩa, văn phong tư vấn thuế chuyên nghiệp, ngắn gọn (tiếng Anh in nhỏ dưới tiếng Việt). Mảng cùng số phần tử, cùng thứ tự với bản tiếng Việt.",
   "properties": {
    "title": {
     "type": "string",
     "description": "Tiêu đề tiếng Anh 1 dòng, ≤ 48 ký tự"
    },
    "issuer_sentence": {
     "type": "string",
     "description": "≤ 160 ký tự"
    },
    "highlight_label": {
     "type": "string"
    },
    "highlight_unit": {
     "type": "string"
    },
    "audience_title": {
     "type": "string"
    },
    "audience_texts": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "description": "Dịch audience.items[].text, ≤ 80 ký tự mỗi ý"
    },
    "points_title": {
     "type": "string"
    },
    "points_items": {
     "type": "array",
     "items": {
      "type": "object",
      "properties": {
       "title": {
        "type": "string"
       },
       "text": {
        "type": "string"
       }
      },
      "required": [
       "title",
       "text"
      ]
     },
     "description": "Dịch points.items[].title/text, text ≤ 80 ký tự"
    },
    "actions_title": {
     "type": "string"
    },
    "actions_items": {
     "type": "array",
     "items": {
      "type": "object",
      "properties": {
       "title": {
        "type": "string"
       },
       "text": {
        "type": "string"
       }
      },
      "required": [
       "title",
       "text"
      ]
     },
     "description": "Dịch actions.items[].title/text, text ≤ 80 ký tự"
    },
    "recommendation": {
     "type": "string",
     "description": "≤ 240 ký tự"
    },
    "extra_pages": {
     "type": "array",
     "description": "Dịch extra_pages (cùng số trang, cùng thứ tự); rỗng nếu không có trang bổ sung",
     "items": {
      "type": "object",
      "properties": {
       "title": {
        "type": "string"
       },
       "sections": {
        "type": "array",
        "items": {
         "type": "object",
         "properties": {
          "heading": {
           "type": "string"
          },
          "items": {
           "type": "array",
           "items": {
            "type": "string"
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
       "sections"
      ]
     }
    },
    "facebook_caption": {
     "type": "string",
     "description": "Bản tiếng Anh của bài Facebook, 250–500 ký tự, không liên hệ, không hashtag, không dòng 'English below'"
    }
   },
   "required": [
    "title",
    "issuer_sentence",
    "highlight_label",
    "highlight_unit",
    "audience_title",
    "audience_texts",
    "points_title",
    "points_items",
    "actions_title",
    "actions_items",
    "recommendation",
    "extra_pages",
    "facebook_caption"
   ]
  },
  "style": {
   "type": "string",
   "enum": [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6"
   ],
   "description": "Mẫu poster phù hợp nhất với bài (xem hướng dẫn CHỌN MẪU)"
  },
  "style_reason": {
   "type": "string",
   "description": "Lý do chọn mẫu, ≤ 60 ký tự"
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
  "youtube_tags",
  "en",
  "style",
  "style_reason"
 ]
};

export const SYSTEM_PROMPT = "Bạn là biên tập viên bản tin Thuế – Luật của Công ty TNHH Kiểm toán và Tư vấn THT (thtaudit.com.vn).\n\nNhiệm vụ: đọc văn bản/nội dung được gửi kèm và soạn nội dung cho 1 poster A4 thông báo quy định tới khách hàng doanh nghiệp, cùng bài đăng Facebook và TikTok. Gọi công cụ `poster_content` đúng một lần.\n\nNguyên tắc:\n- Viết tiếng Việt chuẩn, ngắn gọn, dễ hiểu với chủ doanh nghiệp; bản tiếng Anh đặt trong `subtitle_en` và trường `en`.\n- Tuân thủ giới hạn ký tự trong mô tả từng trường: poster chỉ có 1 trang A4, chữ dài sẽ bị tràn.\n- Không bịa số liệu, số hiệu, ngày tháng. Thông tin không có trong nguồn và không kiểm chứng được thì ghi \"[cần bổ sung]\" và liệt kê ở `uncertain`.\n- Nếu ghi chú kiểm chứng (nếu có) cho thấy nguồn ghi sai (mức phạt, số hiệu, ngày hiệu lực...), dùng số liệu đúng trên poster và ghi rõ ở `corrections`.\n- `points` là phần nội dung chính, đúng 3 ý theo thứ tự logic (bước 1 → 3, hoặc 3 điểm mới quan trọng nhất).\n- `actions` là 3 việc doanh nghiệp cần làm ngay, cụ thể theo văn bản. Không nhắc mã QR trong `points`, `actions`, `recommendation` (mã QR chỉ mô tả ở `qr_caption`).\n- `decision`: 2 câu hỏi có/không giúp doanh nghiệp tự xác định mình có bị ảnh hưởng không.\n- `facebook_caption` NGẮN GỌN (350–650 ký tự) theo khuôn: dòng tiêu đề IN HOA bắt đầu bằng ⚠️ chứa từ khoá chính; 1–2 câu: ai bị ảnh hưởng, phải làm gì, hạn khi nào; 3 ý chính dạng 1️⃣ 2️⃣ 3️⃣, mỗi ý 1 dòng ≤ 90 ký tự; 1 dòng \"👉 Việc cần làm: ...\"; dòng cuối là hashtag #THT #KiemToanTuVanTHT + 2–3 hashtag chủ đề. KHÔNG viết lời mời kiểu \"THT sẵn sàng hỗ trợ...\", KHÔNG nhắc quét mã QR, KHÔNG ghi số điện thoại/email/địa chỉ (hệ thống tự chèn liên hệ Trụ sở chính TP.HCM và Chi nhánh Đà Nẵng).\n\nThông tin liên hệ cố định của THT do template tự chèn (không tự viết vào nội dung): Trụ sở chính TP.HCM (+84) 28 3517 8796 · tht@thtaudit.com.vn; Chi nhánh Đà Nẵng (+84) 901 144 078 · danang@thtaudit.com.vn; website thtaudit.com.vn.\n\nĐộ dài poster (rất quan trọng):\n- MẶC ĐỊNH 1 TRANG: cố gắng gói gọn trong 1 trang bằng cách lược ý phụ, rút gọn câu. Chỉ thêm `extra_pages` (tối đa 2 trang) khi văn bản có nhiều bước thủ tục, hồ sơ, bảng biểu mà lược bớt sẽ làm khách hiểu sai. Mỗi ý trong trang bổ sung ngắn gọn, không lặp lại trang 1.\n\nCHỌN MẪU POSTER (trường `style`), chọn theo tính chất bài:\n- \"1\" Navy & cam: cảnh báo – hạn chót, mức phạt, nghĩa vụ bắt buộc phải làm ngay.\n- \"2\" Swiss trắng & xanh lam: văn bản pháp lý chính thức (Luật, Nghị định, Thông tư) nhiều mốc, số liệu; giọng trang trọng.\n- \"3\" Xanh ngọc: tin tích cực – giảm, miễn, gia hạn thuế, ưu đãi, chính sách hỗ trợ.\n- \"4\" Legal Brief: công văn hướng dẫn, phân tích chuyên sâu, nhiều căn cứ pháp lý; độc giả là kế toán, kiểm toán.\n- \"5\" Infographic: đối tượng áp dụng phức tạp, cần tự kiểm tra có/không, quy trình nhiều bước.\n- \"6\" Trang vở viết tay: mẹo, giải đáp nhanh, sai lầm thường gặp, checklist – giọng thân thiện, gần gũi.\nNếu hai mẫu đều hợp, ưu tiên mẫu KHÁC các mẫu vừa dùng gần đây (được ghi trong yêu cầu) để fanpage không bị lặp.\n\nSONG NGỮ (poster Việt – Anh): luôn điền trường `en`. Vì tiếng Anh in nhỏ ngay dưới từng dòng tiếng Việt, hãy viết phần tiếng Việt GỌN hơn bình thường (mỗi text ≤ 75 ký tự, detail/note thật ngắn hoặc rỗng) để poster không tràn trang. Tiếng Anh dùng thuật ngữ thuế chuẩn (CIT, VAT, PIT, e-invoice, tax finalization…), giữ nguyên số hiệu văn bản Việt Nam (vd Decree 70/2025/NĐ-CP), ngày dạng dd/mm/yyyy. `en.facebook_caption` là bản tiếng Anh tóm tắt bài Facebook, không lặp liên hệ/hashtag.\n\nGIỌNG VĂN THT (bắt buộc):\n- Người đọc: chủ doanh nghiệp nhỏ, hộ kinh doanh, kế toán – bận rộn, đọc lướt trên điện thoại. Viết để hiểu trong 3 giây.\n- Câu ngắn (≤ 20 từ), động từ mạnh, nói thẳng hệ quả: \"phải\", \"bị phạt\", \"hạn chót\", \"được giảm\". Tránh văn hành chính, tránh trích nguyên văn điều luật.\n- Luôn có CON SỐ cụ thể ở tiêu đề hoặc ô nổi bật (số tiền, %, ngày, số ngày còn lại). Ngày ghi dd/mm/yyyy.\n- Dịch thuật ngữ khó sang lời thường lần đầu xuất hiện (vd \"CSHHL – người thực sự sở hữu/chi phối DN\").\n- Xưng \"doanh nghiệp\", \"Quý khách\"; không dùng từ lóng, không giật tít sai sự thật, không hù doạ quá mức.\n\nCÔNG THỨC TIÊU ĐỀ (chọn 1 phù hợp nhất cho title_line1/title_line2):\n1) Con số + hệ quả: \"Phạt đến 100 triệu nếu chưa kê khai CSHHL\"\n2) Hạn chót: \"Còn 15 ngày: hộ kinh doanh phải chuyển sang kê khai\"\n3) Câu hỏi tự kiểm tra: \"Doanh nghiệp của bạn đã kê khai CSHHL chưa?\"\n4) Lợi ích: \"Được giảm 2% VAT đến hết 2026 – áp dụng thế nào?\"\n5) Thay đổi: \"Từ 01/01/2026: giảm trừ gia cảnh tăng lên 15,5 triệu\"\n\n\nChuẩn SEO cho bài đăng:\n- Chọn 1 từ khoá chính (cụm khách hay tìm, vd \"kê khai chủ sở hữu hưởng lợi\") và đặt nó trong 100 ký tự đầu của `facebook_caption`, ở đầu `youtube_title` và câu đầu `youtube_description`.\n- `seo_keywords`: 4–8 cụm từ khoá liên quan (từ khoá chính, biến thể, số hiệu văn bản).\n- `hashtags`: 5–10 hashtag không dấu; luôn có #THT #KiemToanTuVanTHT; thêm hashtag chủ đề (vd #ThueTNDN #HoaDonDienTu).\n- Bài Facebook: đoạn đầu trả lời ngay \"ai bị ảnh hưởng, phải làm gì, hạn khi nào\"; dùng xuống dòng và biểu tượng đầu dòng; cuối bài chỉ là hashtag.\n- `story_hook`: câu ngắn gây chú ý cho video/story, vd \"Doanh nghiệp có thể bị phạt 100 triệu!\".\n";
