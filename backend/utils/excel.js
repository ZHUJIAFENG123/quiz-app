// Excel 导入导出工具
const XLSX = require('xlsx');

/**
 * 解析Excel文件，返回题目数据数组
 */
function parseQuestionsFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  const questions = [];
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel行号（第1行是表头）
    
    try {
      const question = {
        subjectName: String(row['科目'] || '').trim(),
        chapterName: String(row['章节'] || '').trim(),
        type: String(row['题型'] || '').trim(),
        content: String(row['题目'] || '').trim(),
        optionA: String(row['选项A'] || '').trim(),
        optionB: String(row['选项B'] || '').trim(),
        optionC: String(row['选项C'] || '').trim(),
        optionD: String(row['选项D'] || '').trim(),
        answer: String(row['正确答案'] || '').trim(),
        analysis: String(row['解析'] || '').trim(),
      };
      
      // 验证必填字段
      if (!question.subjectName) {
        errors.push(`第${rowNum}行: 科目不能为空`);
        continue;
      }
      if (!question.chapterName) {
        errors.push(`第${rowNum}行: 章节不能为空`);
        continue;
      }
      if (!['单选', '多选', '判断'].includes(question.type)) {
        errors.push(`第${rowNum}行: 题型必须是"单选"、"多选"或"判断"，当前为"${question.type}"`);
        continue;
      }
      if (!question.content) {
        errors.push(`第${rowNum}行: 题目内容不能为空`);
        continue;
      }
      if (!question.answer) {
        errors.push(`第${rowNum}行: 正确答案不能为空`);
        continue;
      }
      
      // 判断题答案标准化
      if (question.type === '判断') {
        if (['正确', '对', '√', 'T', 'True', 'true', 'YES', 'yes'].includes(question.answer)) {
          question.answer = '正确';
        } else if (['错误', '错', '×', 'F', 'False', 'false', 'NO', 'no'].includes(question.answer)) {
          question.answer = '错误';
        }
      }
      
      questions.push(question);
    } catch (err) {
      errors.push(`第${rowNum}行: 解析失败 - ${err.message}`);
    }
  }
  
  return { questions, errors };
}

/**
 * 将题目数据导出为Excel Buffer
 */
function exportQuestionsToExcel(questions) {
  const data = questions.map((q, i) => ({
    '序号': i + 1,
    '科目': q.subjectName,
    '章节': q.chapterName,
    '题型': q.type,
    '题目': q.content,
    '选项A': q.option_a || '',
    '选项B': q.option_b || '',
    '选项C': q.option_c || '',
    '选项D': q.option_d || '',
    '正确答案': q.answer,
    '解析': q.analysis || '',
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // 设置列宽
  worksheet['!cols'] = [
    { wch: 6 },  // 序号
    { wch: 12 }, // 科目
    { wch: 15 }, // 章节
    { wch: 8 },  // 题型
    { wch: 40 }, // 题目
    { wch: 20 }, // 选项A
    { wch: 20 }, // 选项B
    { wch: 20 }, // 选项C
    { wch: 20 }, // 选项D
    { wch: 12 }, // 正确答案
    { wch: 40 }, // 解析
  ];
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '题库');
  
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { parseQuestionsFromExcel, exportQuestionsToExcel };
