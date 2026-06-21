// Excel 导入导出工具
const XLSX = require("xlsx");

/**
 * 解析Excel文件，返回题目数据数组
 * 自动检测两种格式：
 *   格式A（旧）：科目 | 章节 | 题型 | 题目 | 选项A | 选项B | 选项C | 选项D | 正确答案 | 解析
 *   格式B（新）：题型 | 基本类型 | 知识点 | 题目内容 | 供选答案 | 参考答案 | 试题解析
 * 新格式第一行是指示说明，第二行才是表头
 */
function parseQuestionsFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 检测第一行是否为指示说明（新格式特征）
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const firstCellAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const firstCell = sheet[firstCellAddr];
  const firstCellText = firstCell ? String(firstCell.v) : "";
  const hasInstructionRow = firstCellText.indexOf("多个供选答案") !== -1
    || firstCellText.indexOf("供选答案") !== -1;

  // 如果有指示行则从第二行开始读（range: 1 跳过第一行）
  const rangeParam = hasInstructionRow ? 1 : 0;
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: rangeParam });

  const questions = [];
  const errors = [];

  // 检测格式：看是否有 "供选答案" 字段
  const firstRow = rows[0] || {};
  const isNewFormat = ("供选答案" in firstRow) && !("选项A" in firstRow);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = hasInstructionRow ? (i + 3) : (i + 2);
    try {
      let question;

      if (isNewFormat) {
        // ======== 新格式 ========
        const rawOptions = String(row["供选答案"] || "").trim();
        let parts = rawOptions.split(";").map(function(s) { return s.trim(); }).filter(Boolean);
        if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

        question = {
          subjectName: String(row["知识点"] || "").trim(),
          chapterName: String(row["知识点"] || "").trim(),
          type: normalizeType(String(row["题型"] || "").trim()),
          content: String(row["题目内容"] || "").trim(),
          optionA: parts[0] || "",
          optionB: parts[1] || "",
          optionC: parts[2] || "",
          optionD: parts[3] || "",
          answer: normalizeAnswer(String(row["参考答案"] || "").trim(), parts),
          analysis: String(row["试题解析"] || "").trim(),
        };
      } else {
        // ======== 旧格式 ========
        question = {
          subjectName: String(row["科目"] || "").trim(),
          chapterName: String(row["章节"] || "").trim(),
          type: String(row["题型"] || "").trim(),
          content: String(row["题目"] || "").trim(),
          optionA: String(row["选项A"] || "").trim(),
          optionB: String(row["选项B"] || "").trim(),
          optionC: String(row["选项C"] || "").trim(),
          optionD: String(row["选项D"] || "").trim(),
          answer: String(row["正确答案"] || "").trim(),
          analysis: String(row["解析"] || "").trim(),
        };
      }

      // 验证必填字段
      if (!question.subjectName) {
        errors.push("第" + rowNum + "行: 科目/知识点不能为空");
        continue;
      }
      if (!question.chapterName && !isNewFormat) {
        errors.push("第" + rowNum + "行: 章节不能为空");
        continue;
      }
      if (!question.chapterName) {
        question.chapterName = question.subjectName;
      }
      if (["单选题", "多选题", "判断题"].indexOf(question.type) === -1) {
        errors.push("第" + rowNum + "行: 题型必须是单选题、多选题或判断题，当前为：" + question.type);
        continue;
      }
      if (!question.content) {
        errors.push("第" + rowNum + "行: 题目内容不能为空");
        continue;
      }
      if (!question.answer) {
        errors.push("第" + rowNum + "行: 正确答案不能为空");
        continue;
      }

      // 判断题答案标准化
      if (question.type === "判断题") {
        if (["正确", "对", "√", "T", "True", "true", "YES", "yes", "1"].indexOf(question.answer) !== -1) {
          question.answer = "正确";
        } else if (["错误", "错", "×", "F", "False", "false", "NO", "no", "2"].indexOf(question.answer) !== -1) {
          question.answer = "错误";
        }
      }

      questions.push(question);
    } catch (err) {
      errors.push("第" + rowNum + "行: 解析失败 - " + err.message);
    }
  }

  return { questions: questions, errors: errors };
}

/** 标准化题型 */
function normalizeType(raw) {
  if (raw.indexOf("单") !== -1) return "单选题";
  if (raw.indexOf("多") !== -1) return "多选题";
  if (raw.indexOf("判") !== -1 || raw.indexOf("对") !== -1 || raw.indexOf("错") !== -1) return "判断题";
  return raw;
}

/** 标准化答案（新格式用字母 a/b/c/d 表示答案 -> 转为选项内容） */
function normalizeAnswer(raw, options) {
  if (["正确", "对", "√", "T", "True", "true", "YES", "yes", "1"].indexOf(raw) !== -1) return "正确";
  if (["错误", "错", "×", "F", "False", "false", "NO", "no", "2"].indexOf(raw) !== -1) return "错误";

  var letter = raw.trim().toUpperCase();
  var indexMap = { "A": 0, "B": 1, "C": 2, "D": 3 };
  if (letter in indexMap && options[indexMap[letter]]) {
    return options[indexMap[letter]];
  }
  return raw;
}

/** 根据文件名推导科目名称 */
function deriveSubjectFromFilename(fileName) {
  if (!fileName) return "";
  var base = fileName.replace(/^.*[\\\/]/, "").replace(/\.\w+$/, "");
  if (/专业基础/.test(base)) return "专业知识";
  if (/公共基础/.test(base)) return "公共知识";
  if (/辅警/.test(base)) return "辅警管理";
  if (/专业/.test(base)) return "专业知识";
  if (/公共/.test(base)) return "公共知识";
  return base.replace(/^\d+\./, "").replace(/2026.*$/, "").replace(/[年_]/g, "").trim();
}

/**
 * 解析Excel并自动推导科目名
 */
function parseQuestionsFromExcelV2(filePath) {
  var result = parseQuestionsFromExcel(filePath);
  var fileName = filePath;

  for (var i = 0; i < result.questions.length; i++) {
    var q = result.questions[i];
    if (!q.subjectName) {
      q.subjectName = deriveSubjectFromFilename(fileName);
      q.chapterName = q.subjectName;
    }
  }

  return result;
}

/**
 * 将题目数据导出为Excel Buffer
 */
function exportQuestionsToExcel(questions) {
  const data = questions.map((q, i) => ({
    "序号": i + 1,
    "科目": q.subjectName,
    "章节": q.chapterName,
    "题型": q.type,
    "题目": q.content,
    "选项A": q.option_a || "",
    "选项B": q.option_b || "",
    "选项C": q.option_c || "",
    "选项D": q.option_d || "",
    "正确答案": q.answer,
    "解析": q.analysis || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 15 },
    { wch: 8 },
    { wch: 40 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 40 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "题库");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

module.exports = { parseQuestionsFromExcel: parseQuestionsFromExcel, parseQuestionsFromExcelV2: parseQuestionsFromExcelV2, exportQuestionsToExcel: exportQuestionsToExcel, deriveSubjectFromFilename: deriveSubjectFromFilename };
