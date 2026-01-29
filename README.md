# Commute Review (Word → 通勤複習 PWA)

你只需要做一件事：**把更新後的 Word 檔覆蓋到 `source/Key Review.docx`，然後 push 到 GitHub**  
GitHub Actions 會自動：
1. 解析 Word → 產生 `web/data/cards.json`
2. 部署 `web/` 到 GitHub Pages（手機可加入主畫面、離線可用）

---

## 一次性設定（只做一次）

1. 在 GitHub 建立一個新 repo（例如 `commute-review`）
2. 把這個專案全部上傳（或用 git push）
3. 到 repo 的 **Settings → Pages**
   - Source 選 **GitHub Actions**
4. 等待 Actions 跑完（Actions 頁面會看到 workflow 成功）
5. 你的網址會是：
   - `https://<你的帳號>.github.io/<repo 名>/`

---

## 日常更新（你之後每次只需要做這個）

1. 用新的 Word 檔覆蓋：
   - `source/Key Review.docx`
2. `git add source/Key\ Review.docx`
3. `git commit -m "update notes"`
4. `git push`

部署完成後，你打開 Pages 網址就會看到新的卡片。

---

## 本機預覽（可選）

在專案根目錄跑：

```bash
python -m http.server 8000
```

打開 `http://localhost:8000/web/`

---

## 檔案結構

- `source/Key Review.docx`：你的筆記（你只需要更新這個）
- `tools/build_cards.py`：Word → cards.json 產生器
- `web/`：PWA 網頁（GitHub Pages 部署的就是這個資料夾）
- `.github/workflows/deploy.yml`：自動產卡 + 部署

---

## 進度資料在哪？

你的複習進度會存在瀏覽器的 LocalStorage（每個裝置各自一份）。  
你可以在 App 的設定頁做「匯出/匯入 JSON」來搬進度。


## 新版筆記結構（重要）

- **主題（Topic）**：請用 Word 的 **Heading 1** 樣式套在每個大章節標題上。
- **方向（Direction）**：在主題內，用「整段粗體（Bold）」做為複習方向（例如 Definition / Evolution / Future research）。
- **內容段落**：方向下的每段會成為答案的一個 block。
- **刪除線**：有刪除線（strikethrough）的內容會被忽略，不會進入卡片。
- **重點遮罩**：顏色字（藍/紅等）或粗體字會在「提示」階段被自動遮住成 `_____`。
