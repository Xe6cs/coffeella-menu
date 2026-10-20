/*
  بيانات قائمة كوفيلا
  ───────────────────
  لتعديل الأسعار أو إضافة صنف جديد عدّل هذا الملف فقط.
  - price: رقم واحد (مثل 3000) أو مدى سعري [4000, 5000]
  - photo: (اختياري) مسار صورة القسم، مثل "assets/hot.jpg"
  - focus: (اختياري) نقطة تركيز الصورة داخل البطاقة، مثل "center 40%"
*/
window.COFFEELLA_MENU = [
  {
    id: "hot",
    ar: "مشروبات ساخنة",
    en: "Hot Drinks",
    icon: "hot",
    photo: "assets/hot.jpg",
    focus: "40% 62%",
    groups: [
      {
        ar: "القهوة والمشروبات الساخنة",
        en: "Coffee & Hot Drinks",
        items: [
          { ar: "اسبريسو", en: "Espresso", price: 3000 },
          { ar: "اسبريسو لونجو", en: "Espresso Lungo", price: 3000 },
          { ar: "اسبريسو أفوكاتو", en: "Espresso Affogato", price: 5000 },
          { ar: "اسبريسو ألفريدو", en: "Espresso Alfredo", price: 5000 },
          { ar: "أمريكانو", en: "Americano", price: [4000, 5000] },
          { ar: "كورتادو", en: "Cortado", price: [4000, 5000] },
          { ar: "مكياتو", en: "Macchiato", price: [4000, 5000] },
          { ar: "لاتيه", en: "Latte", price: [4000, 5000] },
          { ar: "سبانش لاتيه", en: "Spanish Latte", price: [4000, 5000] },
          { ar: "موكا", en: "Mocha", price: [4000, 5000] },
          { ar: "موكاتشينو", en: "Mochachino", price: [4000, 5000] },
          { ar: "فلات وايت", en: "Flat White", price: [4000, 5000] },
          { ar: "نسكافيه", en: "Nescafé", price: [4000, 5000] },
          { ar: "كابتشينو", en: "Cappuccino", price: [4000, 5000] },
          { ar: "شوكولا ساخنة", en: "Hot Chocolate", price: [4000, 5000] },
          { ar: "ماتشا", en: "Matcha", price: [4000, 4500] },
          { ar: "ماتشا لاتيه", en: "Matcha Latte", price: [4000, 5000] },
          { ar: "قهوة تركية", en: "Turkish Coffee", price: [2500, 5000] }
        ]
      }
    ]
  },
  {
    id: "cold",
    ar: "مشروبات باردة",
    en: "Cold Drinks",
    icon: "cold",
    photo: "assets/cold.jpg",
    focus: "35% 52%",
    groups: [
      {
        ar: "قهوة وماتشا مثلجة",
        en: "Iced Coffee & Matcha",
        items: [
          { ar: "أمريكانو أورنج", en: "American Orange", price: 5000 },
          { ar: "بلاك هني كوفي", en: "Black Honey Coffee", price: 5000 },
          { ar: "كولد برو", en: "Cold Brew", price: 5000 },
          { ar: "آيس موكا", en: "Iced Mocha", price: 5000 },
          { ar: "آيس مكياتو", en: "Iced Macchiato", price: 5000 },
          { ar: "باستيل كوفي لاتيه", en: "Pastel Coffee Latte", price: 5000 },
          { ar: "آيس سبانش لاتيه", en: "Iced Spanish Latte", price: 5000 },
          { ar: "ماتشا بينك لاتيه", en: "Matcha Pink Latte", price: 5000 },
          { ar: "ماتشا بلاك كريم", en: "Matcha Cream Black", price: 5000 }
        ]
      },
      {
        ar: "منعشات وموهيتو",
        en: "Refreshers & Mojito",
        items: [
          { ar: "ليمون جرين تي", en: "Lemon Green Tea", price: 4500 },
          { ar: "تاي تي ستروبيري", en: "Thai Tea Strawberry", price: 4500 },
          { ar: "مكس بيري آيس تي", en: "Mixed Berry Iced Tea", price: 4500 },
          { ar: "آيس ليمون آبل", en: "Iced Apple Lemon", price: 4500 },
          { ar: "موهيتو بلو سكاي", en: "Mojito Blue Sky", price: 5000 },
          { ar: "موهيتو بلو هاواي", en: "Mojito Blue Hawaii", price: 5000 },
          { ar: "سوفت كيوي ريد بيريز", en: "Soft Kiwi Red Berry", price: 5000 }
        ]
      },
      {
        ar: "فرابيه",
        en: "Frappé",
        items: [
          { ar: "فرابيه فانيلا", en: "Vanilla Frappé", price: 6000 },
          { ar: "فرابيه كراميل", en: "Caramel Frappé", price: 6000 },
          { ar: "فرابيه شوكولا", en: "Chocolate Frappé", price: 6000 },
          { ar: "فرابيه بندق", en: "Hazelnut Frappé", price: 6000 }
        ]
      },
      {
        ar: "سموذي",
        en: "Smoothies",
        items: [
          { ar: "سموذي تفاح أخضر وكيوي", en: "Green Apple Kiwi", price: 5000 },
          { ar: "سموذي مكس بيريز", en: "Mixed Berries", price: 5000 },
          { ar: "سموذي فراولة", en: "Strawberry", price: 5000 },
          { ar: "سموذي باشن فروت", en: "Passion Fruit", price: 5000 },
          { ar: "سموذي ليمون وفراولة", en: "Strawberry Lemonade", price: 5000 },
          { ar: "سموذي مانجو وليمون", en: "Lemon Mango", price: 5000 }
        ]
      },
      {
        ar: "ميلك شيك",
        en: "Milkshakes",
        items: [
          { ar: "ميلك شيك فراولة وموز", en: "Strawberry Banana", price: 6000 },
          { ar: "ميلك شيك شوكولا وموز", en: "Chocolate Banana", price: 6000 },
          { ar: "ميلك شيك نسكافيه", en: "Nescafé", price: 5500 },
          { ar: "ميلك شيك بستاشيو", en: "Pistachio", price: 6000 }
        ]
      }
    ]
  },
  {
    id: "desserts",
    ar: "حلويات ومخبوزات",
    en: "Desserts & Bakery",
    icon: "desserts",
    photo: "assets/desserts.jpg",
    focus: "center 35%",
    groups: [
      {
        ar: "مخبوزات",
        en: "Bakery",
        items: [
          { ar: "كرواسون جبن", en: "Cheese Croissant", price: 3000 },
          { ar: "كرواسون شوكولا", en: "Chocolate Croissant", price: 3000 },
          { ar: "كرواسون سادة", en: "Plain Croissant", price: 3000 },
          { ar: "كرواسون زعتر", en: "Za'atar Croissant", price: 3000 },
          { ar: "كرواسون نوتيلا", en: "Nutella Croissant", price: 3000 },
          { ar: "مافن شوكولا", en: "Chocolate Muffin", price: 3000 },
          { ar: "مافن قرفة", en: "Cinnamon Muffin", price: 3000 },
          { ar: "مافن تفاح أخضر", en: "Green Apple Muffin", price: 3000 },
          { ar: "مافن توت أزرق", en: "Blueberry Muffin", price: 3000 }
        ]
      },
      {
        ar: "حلويات",
        en: "Pastry",
        items: [
          { ar: "كوكيز 40", en: "Cookies 40", price: 2500 },
          { ar: "كوكيز 80", en: "Cookies 80", price: 3500 },
          { ar: "ميني كوكيز", en: "Mini Cookies", price: 4000 },
          { ar: "براونيز شوكولا", en: "Chocolate Brownie", price: 3000 },
          { ar: "براونيز كراميل", en: "Caramel Brownie", price: 5000 },
          { ar: "فيريرو كيك", en: "Ferrero Cake", price: 4000 },
          { ar: "فدج كيك", en: "Fudge Cake", price: 4000 },
          { ar: "دبل شوكولا كيك", en: "Double Chocolate Cake", price: 4000 },
          { ar: "شوكولا كيك", en: "Chocolate Cake", price: 4000 },
          { ar: "جيرمن كيك", en: "German Cake", price: 4000 },
          { ar: "إنكلش كيك", en: "English Cake", price: 4000 },
          { ar: "كريب", en: "Crêpe", price: 5000 },
          { ar: "وافل", en: "Waffle", price: 5000 }
        ]
      },
      {
        ar: "تشيز كيك",
        en: "Cheesecake",
        items: [
          { ar: "تشيز كيك شوكولا", en: "Chocolate", price: 4000 },
          { ar: "تشيز كيك دبل شوكولا", en: "Double Chocolate", price: 4000 },
          { ar: "تشيز كيك نسكافيه شوكولا", en: "Nescafé Chocolate", price: 4000 },
          { ar: "تشيز كيك كيوي", en: "Kiwi", price: 4000 },
          { ar: "تشيز كيك روزبيري", en: "Roseberry", price: 4000 },
          { ar: "تشيز كيك بلوبيري", en: "Blueberry", price: 4000 },
          { ar: "تشيز كيك ستروبيري", en: "Strawberry", price: 4000 },
          { ar: "سان سباستيان تشيز كيك", en: "San Sebastián", price: 4000 },
          { ar: "تشيز كيك بستاشيو", en: "Pistachio", price: 4000 },
          { ar: "تشيز كيك باونتي", en: "Bounty", price: 4000 },
          { ar: "تشيز كيك أوريو", en: "Oreo", price: 4000 },
          { ar: "تشيز كيك لوتس", en: "Lotus", price: 4000 }
        ]
      }
    ]
  }
];
