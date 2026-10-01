/**
 * feedback-widget.js
 * 國立臺中科技大學 校務研究戰情室 - 意見與數據回饋元件
 * 
 * 特色：
 * 1. 自動偵測當前系所、滾動位置、當前模組與環境參數
 * 2. 支援鍵盤 ⌘V / Ctrl+V 直接貼上剪貼簿截圖，免存檔上傳
 * 3. 快速問題分類 Chip，免打字單選
 * 4. 串接 Google Sheet (Apps Script Web App) + 備援一鍵複製 Markdown
 * 5. 完全符合 GEMINI.md 與 Impeccable Design 規範，無花哨漸層與毛玻璃，簡約高質感
 */

(function () {
    // 預設 Google Apps Script Web App 端點 (可由使用者部署後直接抽換)
    // 若尚未填入，元件會自動啟用「一鍵複製結構化回報」與「暫存記錄」模式
    const DEFAULT_GAS_ENDPOINT = "";
    const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/10TuUV8ZANUHmtC1vOMJQXU30PfHPIWQXgixTkcOG1l8/edit";

    // 偵測系所名稱
    function detectDepartment() {
        const title = document.title || "";
        if (title.includes("企業管理") || window.location.pathname.includes("ba")) return "企業管理系";
        if (title.includes("財務金融") || window.location.pathname.includes("finance")) return "財務金融系";
        if (title.includes("會計資訊") || window.location.pathname.includes("accounting")) return "會計資訊系";
        if (title.includes("國際貿易") || window.location.pathname.includes("ib")) return "國際貿易系";
        return "校務戰情室";
    }

    // 偵測當前視窗中最靠近的模組或區塊標題
    function detectCurrentSection() {
        const sections = document.querySelectorAll("section[id], div[id^='module'], div[id*='cockpit'], div[id*='section']");
        let closestSection = "全站總覽";
        let minDistance = Infinity;

        sections.forEach(sec => {
            const rect = sec.getBoundingClientRect();
            // 只要區塊頂部在視窗上半部或接近中央
            const distance = Math.abs(rect.top);
            if (distance < minDistance) {
                minDistance = distance;
                const heading = sec.querySelector("h2, h3, h4");
                closestSection = heading ? heading.innerText.trim().replace(/\s+/g, ' ') : sec.id;
            }
        });

        // 截短過長標題
        if (closestSection.length > 40) {
            closestSection = closestSection.substring(0, 40) + "...";
        }
        return closestSection;
    }

    // 建立浮動觸發按鈕與抽屜 HTML
    function injectWidgetUI() {
        if (document.getElementById("nutc-feedback-drawer")) return;

        // 1. 浮動觸發按鈕
        const triggerBtn = document.createElement("button");
        triggerBtn.id = "nutc-feedback-trigger";
        triggerBtn.type = "button";
        triggerBtn.className = "fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xl border border-stone-700/60 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer";
        triggerBtn.innerHTML = `
            <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span class="tracking-tight">問題回報與建議</span>
        `;

        // 2. 抽屜背景遮罩
        const overlay = document.createElement("div");
        overlay.id = "nutc-feedback-overlay";
        overlay.className = "fixed inset-0 bg-stone-900/40 z-50 transition-opacity duration-200 hidden opacity-0";

        // 3. 側邊抽屜容器
        const drawer = document.createElement("div");
        drawer.id = "nutc-feedback-drawer";
        drawer.className = "fixed inset-y-0 right-0 max-w-md w-full bg-white z-50 shadow-2xl flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out border-l border-stone-200";
        drawer.innerHTML = `
            <!-- Header -->
            <div class="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
                <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-xs">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-stone-900">意見反饋與問題回報</h3>
                        <p class="text-[11px] text-stone-500" id="fb-detected-dept">國立臺中科技大學 校務研究戰情室</p>
                    </div>
                </div>
                <button type="button" id="nutc-feedback-close" class="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <!-- Body (Scrollable) -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs text-stone-700">
                <!-- 1. 問題類型 (Pills) -->
                <div>
                    <label class="block text-[11px] font-bold text-stone-900 uppercase tracking-wider mb-2">1. 回報類型 (單選)</label>
                    <div class="grid grid-cols-2 gap-2" id="fb-type-group">
                        <button type="button" data-val="📊 數據疑義" class="fb-type-pill active px-3 py-2 rounded-lg border text-left font-medium transition flex items-center gap-1.5 bg-stone-900 text-white border-stone-900">
                            <span>📊</span> <span>數據疑義 / 數值有誤</span>
                        </button>
                        <button type="button" data-val="🎨 介面破版" class="fb-type-pill px-3 py-2 rounded-lg border text-left font-medium transition flex items-center gap-1.5 bg-white text-stone-700 border-stone-200 hover:border-stone-400">
                            <span>🎨</span> <span>介面破版 / 排版跑位</span>
                        </button>
                        <button type="button" data-val="💡 內容建議" class="fb-type-pill px-3 py-2 rounded-lg border text-left font-medium transition flex items-center gap-1.5 bg-white text-stone-700 border-stone-200 hover:border-stone-400">
                            <span>💡</span> <span>功能或文字建議</span>
                        </button>
                        <button type="button" data-val="🔗 連結失效" class="fb-type-pill px-3 py-2 rounded-lg border text-left font-medium transition flex items-center gap-1.5 bg-white text-stone-700 border-stone-200 hover:border-stone-400">
                            <span>🔗</span> <span>下載或超連結失效</span>
                        </button>
                    </div>
                </div>

                <!-- 2. 自動偵測模組位置 -->
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="text-[11px] font-bold text-stone-900 uppercase tracking-wider">2. 發生位置 (自動抓取)</label>
                        <span class="text-[10px] text-emerald-600 font-medium">✓ 已自動鎖定</span>
                    </div>
                    <div class="p-2.5 rounded-lg bg-stone-50 border border-stone-200 font-mono text-[11px] text-stone-800 break-all" id="fb-current-location">
                        正在定位目前畫面...
                    </div>
                </div>

                <!-- 3. 截圖輔助 (支援 ⌘V 貼上) -->
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="text-[11px] font-bold text-stone-900 uppercase tracking-wider">3. 截圖存證 (選填 · 支援 ⌘V 貼上)</label>
                        <button type="button" id="fb-remove-screenshot" class="text-[10px] text-rose-600 hover:underline hidden">移除截圖</button>
                    </div>
                    <div id="fb-paste-dropzone" class="p-4 rounded-xl border-2 border-dashed border-stone-300 hover:border-stone-500 bg-stone-50/50 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5 min-h-[90px]">
                        <div id="fb-dropzone-prompt" class="space-y-1">
                            <svg class="w-6 h-6 text-stone-400 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            <p class="text-xs font-semibold text-stone-800">點此按 ⌘V / Ctrl+V 直接貼上截圖</p>
                            <p class="text-[10px] text-stone-400">或點擊此處選取本機圖片檔</p>
                        </div>
                        <img id="fb-screenshot-preview" class="max-h-40 w-auto rounded border border-stone-200 shadow-xs hidden object-contain" alt="截圖預覽" />
                        <input type="file" id="fb-file-input" accept="image/*" class="hidden" />
                    </div>
                </div>

                <!-- 4. 具體狀況描述 -->
                <div>
                    <label class="block text-[11px] font-bold text-stone-900 uppercase tracking-wider mb-1.5">
                        4. 具體狀況描述 <span class="text-rose-500">*</span>
                    </label>
                    <textarea id="fb-description" rows="3" class="w-full px-3 py-2 rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900 text-xs leading-relaxed" placeholder="請簡述哪一項數據或按鈕有疑問？例如：「統測最低錄取分 114 年欄位與官方榜單相差 2 分」"></textarea>
                </div>

                <!-- 5. 提報人稱呼 / 單位 -->
                <div>
                    <label class="block text-[11px] font-bold text-stone-900 uppercase tracking-wider mb-1.5">
                        5. 提報人稱呼 / 單位 <span class="text-stone-400 font-normal">(選填)</span>
                    </label>
                    <input type="text" id="fb-reporter" class="w-full px-3 py-1.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900 text-xs" placeholder="例如：企管系 某某教師 / 訪評委員 (留空則為匿名)" />
                </div>

                <!-- 狀態回饋訊息區 -->
                <div id="fb-alert" class="p-3 rounded-lg text-xs hidden"></div>
            </div>

            <!-- Footer (Action) -->
            <div class="p-4 sm:p-5 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-3">
                <button type="button" id="fb-copy-markdown-btn" class="px-3 py-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1.5 transition">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>複製報告</span>
                </button>
                <button type="button" id="fb-submit-btn" class="flex-1 px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    <span>送出回饋至 Google Sheet</span>
                </button>
            </div>
        `;

        document.body.appendChild(triggerBtn);
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        bindWidgetEvents();
    }

    // 狀態變數
    let currentScreenshotBase64 = null;
    let selectedType = "📊 數據疑義";

    function openDrawer() {
        const drawer = document.getElementById("nutc-feedback-drawer");
        const overlay = document.getElementById("nutc-feedback-overlay");
        const dept = detectDepartment();
        const loc = detectCurrentSection();

        document.getElementById("fb-detected-dept").innerText = `國立臺中科技大學 ${dept}`;
        document.getElementById("fb-current-location").innerText = `[${dept}] ${loc}`;

        overlay.classList.remove("hidden");
        setTimeout(() => {
            overlay.classList.remove("opacity-0");
            drawer.classList.remove("translate-x-full");
        }, 10);
    }

    function closeDrawer() {
        const drawer = document.getElementById("nutc-feedback-drawer");
        const overlay = document.getElementById("nutc-feedback-overlay");

        drawer.classList.add("translate-x-full");
        overlay.classList.add("opacity-0");
        setTimeout(() => {
            overlay.classList.add("hidden");
        }, 300);
    }

    // 綁定所有互動事件
    function bindWidgetEvents() {
        document.getElementById("nutc-feedback-trigger").addEventListener("click", openDrawer);
        document.getElementById("nutc-feedback-close").addEventListener("click", closeDrawer);
        document.getElementById("nutc-feedback-overlay").addEventListener("click", closeDrawer);

        // 1. 類型切換
        const pills = document.querySelectorAll(".fb-type-pill");
        pills.forEach(p => {
            p.addEventListener("click", () => {
                pills.forEach(other => {
                    other.classList.remove("bg-stone-900", "text-white", "border-stone-900");
                    other.classList.add("bg-white", "text-stone-700", "border-stone-200");
                });
                p.classList.remove("bg-white", "text-stone-700", "border-stone-200");
                p.classList.add("bg-stone-900", "text-white", "border-stone-900");
                selectedType = p.getAttribute("data-val");
            });
        });

        // 2. 剪貼簿 ⌘V / Ctrl+V 貼上截圖監聽
        const dropzone = document.getElementById("fb-paste-dropzone");
        const fileInput = document.getElementById("fb-file-input");
        const preview = document.getElementById("fb-screenshot-preview");
        const promptText = document.getElementById("fb-dropzone-prompt");
        const removeBtn = document.getElementById("fb-remove-screenshot");

        dropzone.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                handleImageFile(e.target.files[0]);
            }
        });

        // 監聽全域與局部 paste 事件
        window.addEventListener("paste", (e) => {
            const drawer = document.getElementById("nutc-feedback-drawer");
            // 只有抽屜打開時才接收貼上截圖
            if (drawer.classList.contains("translate-x-full")) return;

            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.type.indexOf("image") !== -1) {
                    const blob = item.getAsFile();
                    handleImageFile(blob);
                    e.preventDefault();
                    break;
                }
            }
        });

        function handleImageFile(file) {
            const reader = new FileReader();
            reader.onload = function (evt) {
                currentScreenshotBase64 = evt.target.result;
                preview.src = currentScreenshotBase64;
                preview.classList.remove("hidden");
                promptText.classList.add("hidden");
                removeBtn.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
        }

        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            currentScreenshotBase64 = null;
            preview.src = "";
            preview.classList.add("hidden");
            promptText.classList.remove("hidden");
            removeBtn.classList.add("hidden");
            fileInput.value = "";
        });

        // 3. 一鍵複製 Markdown
        document.getElementById("fb-copy-markdown-btn").addEventListener("click", () => {
            const payload = collectFeedbackPayload();
            const md = formatAsMarkdown(payload);
            navigator.clipboard.writeText(md).then(() => {
                showAlert("success", "✓ 已複製結構化 Markdown 報告，可直接貼給工程師或 AI 修復！");
            }).catch(() => {
                showAlert("error", "複製失敗，請手動選取文字。");
            });
        });

        // 4. 送出至 Google Sheet
        document.getElementById("fb-submit-btn").addEventListener("click", submitFeedback);
    }

    // 收集所有環境與表單資料
    function collectFeedbackPayload() {
        const dept = detectDepartment();
        const section = document.getElementById("fb-current-location").innerText;
        const desc = document.getElementById("fb-description").value.trim();
        const reporter = document.getElementById("fb-reporter").value.trim() || "匿名提報人";

        return {
            timestamp: new Date().toISOString(),
            department: dept,
            type: selectedType,
            section: section,
            description: desc,
            reporter: reporter,
            url: window.location.href,
            device: `${window.innerWidth}x${window.innerHeight} (${navigator.userAgent.includes("Mac") ? "macOS" : "Windows"} / ${navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser"})`,
            screenshot: currentScreenshotBase64,
            context: {
                pathname: window.location.pathname,
                hash: window.location.hash,
                screen_width: window.innerWidth,
                screen_height: window.innerHeight,
                user_agent: navigator.userAgent
            }
        };
    }

    // 將資料格式化為 AI / 開發者最易閱讀的 Markdown
    function formatAsMarkdown(data) {
        return `### 🚨 校務戰情室問題回報單
- **所屬科系**：${data.department}
- **問題類型**：${data.type}
- **所在模組**：${data.section}
- **提報人/身分**：${data.reporter}
- **回報時間**：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
- **問題詳情**：
> ${data.description || "（未填寫描述）"}

- **測試環境**：${data.device}
- **頁面 URL**：${data.url}
- **附帶截圖**：${data.screenshot ? "已包含 Base64 截圖" : "無截圖"}
`;
    }

    // 顯示提示訊息
    function showAlert(type, msg) {
        const el = document.getElementById("fb-alert");
        el.className = `p-3 rounded-lg text-xs leading-relaxed ${type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`;
        el.innerHTML = msg;
        el.classList.remove("hidden");
    }

    // 送出處理
    function submitFeedback() {
        const descInput = document.getElementById("fb-description");
        if (!descInput.value.trim()) {
            showAlert("error", "請填寫具體狀況描述（一兩句話即可），方便快速修復！");
            descInput.focus();
            return;
        }

        const payload = collectFeedbackPayload();
        const submitBtn = document.getElementById("fb-submit-btn");
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span>記錄中...</span>
        `;

        // 檢查是否已設定 Google Apps Script Web App 端點
        const gasUrl = window.NUTC_FEEDBACK_GAS_URL || DEFAULT_GAS_ENDPOINT;

        if (gasUrl) {
            // 發送至 Google Apps Script Web App
            fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(result => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>✓ 已成功寫入 Google Sheet</span>`;
                showAlert("success", `✓ 回饋已成功傳送並記錄於 Google 試算表！感謝您的協助。`);
                setTimeout(() => closeDrawer(), 2500);
            })
            .catch(err => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>送出回饋</span>`;
                showAlert("error", `送出至 Google Sheet 遇到網路限制：${err}。<br>請點擊左側「複製報告」直接傳送給我們！`);
            });
        } else {
            // 尚未綁定 GAS 端點時的親切處理：引導複製並提供 Google Sheet 連結
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>✓ 回饋已就緒</span>`;
                const md = formatAsMarkdown(payload);
                navigator.clipboard.writeText(md).catch(() => {});
                showAlert("success", `
                    <strong>✓ 回報內容已為您複製至剪貼簿！</strong><br>
                    可直接貼在對話視窗交給 AI / 開發工程師秒速修復。<br>
                    <a href="${SPREADSHEET_URL}" target="_blank" class="underline font-bold mt-1 inline-block text-emerald-900">
                        點此查看 Google 試算表資料庫 ↗
                    </a>
                `);
            }, 600);
        }
    }

    // 當 DOM 準備好時自動載入
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectWidgetUI);
    } else {
        injectWidgetUI();
    }
})();
