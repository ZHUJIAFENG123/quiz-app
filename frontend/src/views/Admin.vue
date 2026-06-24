<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- 顶部栏 -->
    <header class="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
      <router-link to="/" class="text-gray-400 hover:text-gray-600">
        <font-awesome-icon icon="arrow-left" />
      </router-link>
      <h1 class="text-lg font-bold text-gray-800">后台管理</h1>
    </header>

    <!-- 移动端顶部标签 -->
    <div class="md:hidden bg-white border-b border-gray-100 overflow-x-auto shrink-0">
      <div class="flex">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="[
            'px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors',
            activeTab === t.key
              ? 'border-primary-600 text-primary-600 font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
          @click="activeTab = t.key"
        >
          <font-awesome-icon :icon="t.icon" class="mr-1.5" />
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <!-- 桌面端侧边导航 -->
      <aside class="hidden md:block w-48 bg-white border-r border-gray-200 shrink-0 overflow-y-auto">
        <nav class="py-2">
          <button
            v-for="t in tabs"
            :key="t.key"
            :class="[
              'w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors',
              activeTab === t.key
                ? 'bg-primary-50 text-primary-600 font-medium border-r-2 border-primary-600'
                : 'text-gray-600 hover:bg-gray-50'
            ]"
            @click="activeTab = t.key"
          >
            <font-awesome-icon :icon="t.icon" class="w-4 text-center" />
            {{ t.label }}
          </button>
        </nav>
      </aside>

      <!-- 主内容区 -->
      <main class="flex-1 overflow-y-auto p-4 md:p-6">
        <!-- ========== 题库管理 ========== -->
        <div v-if="activeTab === 'questions'">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 class="text-lg font-semibold text-gray-800">题库管理</h2>
            <button class="btn-primary text-sm !px-3 !py-1.5 flex items-center gap-1" @click="openQuestionModal()">
              <font-awesome-icon icon="plus" />
              添加题目
            </button>
          </div>

          <!-- 搜索/筛选栏 -->
          <div class="card border border-gray-100 mb-4">
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="flex-1 relative">
                <font-awesome-icon icon="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  v-model="qSearch"
                  class="input !pl-9"
                  placeholder="搜索题目内容..."
                  @input="onSearchInput"
                />
              </div>
              <select v-model="qSubjectFilter" class="input sm:w-36 text-sm" @change="loadQuestions">
                <option value="">全部科目</option>
                <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <select v-model="qChapterFilter" class="input sm:w-36 text-sm" @change="loadQuestions">
                <option value="">全部章节</option>
                <option v-for="c in filteredChapters" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <select v-model="qTypeFilter" class="input sm:w-28 text-sm" @change="loadQuestions">
                <option value="">全部类型</option>
                <option value="单选">单选</option>
                <option value="多选">多选</option>
                <option value="判断">判断</option>
              </select>
            </div>
          </div>

          <!-- 批量操作 -->
          <div v-if="questions.length > 0" class="flex items-center gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                :checked="qIsAllSelected"
                @change="qToggleSelectAll"
                class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              全选
            </label>
            <button
              v-if="qSelectedIds.length > 0"
              class="btn-danger text-sm !px-3 !py-1 flex items-center gap-1"
              @click="batchDeleteQuestions"
            >
              <font-awesome-icon icon="trash" />
              批量删除 ({{ qSelectedIds.length }})
            </button>
          </div>

          <!-- 题目列表 -->
          <div v-if="qLoading" class="text-center py-10 text-gray-400">
            <div class="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            加载中...
          </div>
          <div v-else-if="questions.length === 0" class="text-center py-10 text-gray-400">暂无题目</div>
          <div v-else class="space-y-2">
            <div
              v-for="(q, idx) in questions"
              :key="q.id"
              class="card border border-gray-100 hover:shadow-sm transition-shadow"
            >
              <div class="flex items-start gap-3">
                <input
                  type="checkbox"
                  :checked="qSelectedIds.includes(q.id)"
                  @change="qToggleSelect(q.id)"
                  class="w-4 h-4 mt-1 text-primary-600 rounded border-gray-300 focus:ring-primary-500 shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs text-gray-400 font-mono">#{{ (qPage - 1) * qPageSize + idx + 1 }}</span>
                    <span :class="['tag', qTypeClass(q.type)]">{{ qTypeLabel(q.type) }}</span>
                    <span class="text-xs text-gray-400">{{ q.subject_name }}</span>
                    <span class="text-xs text-gray-400">· {{ q.chapter_name }}</span>
                    <span class="text-xs text-gray-400">难度 {{ q.difficulty || 1 }}</span>
                  </div>
                  <p class="text-sm text-gray-700 truncate">{{ q.content }}</p>
                  <p class="text-xs text-gray-400 mt-1">答案: {{ q.answer }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button class="text-gray-400 hover:text-primary-600 px-1.5 py-1" title="编辑" @click="openQuestionModal(q)">
                    <font-awesome-icon icon="edit" class="text-sm" />
                  </button>
                  <button class="text-gray-400 hover:text-red-500 px-1.5 py-1" title="删除" @click="deleteQuestion(q.id)">
                    <font-awesome-icon icon="trash" class="text-sm" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="qTotalPages > 1" class="flex items-center justify-center gap-1 mt-4">
            <button :disabled="qPage <= 1" class="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30" @click="qGoPage(qPage - 1)">
              <font-awesome-icon icon="chevron-left" />
            </button>
            <button v-for="p in qVisiblePages" :key="p" :class="['w-8 h-8 flex items-center justify-center rounded-lg text-sm', p === qPage ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100']" @click="qGoPage(p)">{{ p }}</button>
            <button :disabled="qPage >= qTotalPages" class="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30" @click="qGoPage(qPage + 1)">
              <font-awesome-icon icon="chevron-right" />
            </button>
          </div>
        </div>

        <!-- ========== 数据管理 ========== -->
        <div v-if="activeTab === 'data'" class="space-y-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">数据管理</h2>

          <!-- 数据库统计 -->
          <div class="card border border-gray-100">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">数据库概况</h3>
            <div v-if="dbInfoLoading" class="text-sm text-gray-400">加载中...</div>
            <div v-else class="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.tables?.subjects || 0 }}</p>
                <p class="text-xs text-gray-400">科目</p>
              </div>
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.tables?.chapters || 0 }}</p>
                <p class="text-xs text-gray-400">章节</p>
              </div>
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.tables?.questions || 0 }}</p>
                <p class="text-xs text-gray-400">题目</p>
              </div>
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.tables?.study_records || 0 }}</p>
                <p class="text-xs text-gray-400">学习记录</p>
              </div>
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.tables?.wrong_questions || 0 }}</p>
                <p class="text-xs text-gray-400">错题</p>
              </div>
              <div class="text-center p-2 bg-gray-50 rounded-lg">
                <p class="text-xl font-bold text-primary-600">{{ dbInfo.db_size_mb || 0 }}MB</p>
                <p class="text-xs text-gray-400">数据库大小</p>
              </div>
            </div>
          </div>

          <!-- 云端同步 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-gray-700">云端同步</h3>
                <p class="text-xs text-gray-400 mt-1">
                  <template v-if="syncSuccess">上次同步: {{ syncStatusText }}，记录{{ syncCount?.studyRecords || 0 }}条</template>
                  <template v-else>将学习记录保存到 GitHub，重启后自动恢复</template>
                </p>
              </div>
              <button class="btn-primary text-sm !px-3 !py-1.5 flex items-center gap-1" @click="syncToCloud" :disabled="syncing">
                <font-awesome-icon icon="cloud-arrow-up" :spin="syncing" />
                {{ syncing ? '同步中...' : '立即同步' }}
              </button>
            </div>
          </div>

          <!-- 学习数据 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-gray-700">学习数据</h3>
                <p class="text-xs text-gray-400 mt-1">清空所有学习记录、错题和收藏</p>
              </div>
              <button class="btn-danger text-sm !px-3 !py-1.5 flex items-center gap-1" @click="confirmClearStudy">
                <font-awesome-icon icon="broom" />
                清空学习数据
              </button>
            </div>
          </div>

          <!-- 科目管理 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-700">科目管理</h3>
              <button class="btn-primary text-sm !px-3 !py-1 flex items-center gap-1" @click="openSubjectModal()">
                <font-awesome-icon icon="plus" />
                新建科目
              </button>
            </div>
            <div v-if="subjects.length === 0" class="text-sm text-gray-400 text-center py-4">暂无科目</div>
            <div v-else class="space-y-2">
              <div v-for="s in subjects" :key="s.id" class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span class="text-sm text-gray-700">{{ s.name }}</span>
                  <span v-if="s.description" class="text-xs text-gray-400 ml-2">{{ s.description }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button class="text-gray-400 hover:text-primary-600 px-1.5 py-1" @click="openSubjectModal(s)">
                    <font-awesome-icon icon="edit" class="text-sm" />
                  </button>
                  <button class="text-gray-400 hover:text-red-500 px-1.5 py-1" @click="deleteSubject(s.id)">
                    <font-awesome-icon icon="trash" class="text-sm" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 章节管理 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-700">章节管理</h3>
              <button class="btn-primary text-sm !px-3 !py-1 flex items-center gap-1" @click="openChapterModal()">
                <font-awesome-icon icon="plus" />
                新建章节
              </button>
            </div>
            <div v-if="subjects.length > 0" class="mb-3">
              <select v-model="chapterSubjectFilter" class="input sm:w-44 text-sm" @change="loadChapters">
                <option value="">全部科目</option>
                <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div v-if="chapters.length === 0" class="text-sm text-gray-400 text-center py-4">暂无章节</div>
            <div v-else class="space-y-2">
              <div v-for="c in chapters" :key="c.id" class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span class="text-sm text-gray-700">{{ c.name }}</span>
                  <span class="text-xs text-gray-400 ml-2">{{ c.subject_name }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button class="text-gray-400 hover:text-primary-600 px-1.5 py-1" @click="openChapterModal(c)">
                    <font-awesome-icon icon="edit" class="text-sm" />
                  </button>
                  <button class="text-gray-400 hover:text-red-500 px-1.5 py-1" @click="deleteChapter(c.id)">
                    <font-awesome-icon icon="trash" class="text-sm" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== 导入导出 ========== -->
        <div v-if="activeTab === 'importexport'" class="space-y-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">导入导出</h2>

          <!-- 上传区域 -->
          <div class="card border border-gray-100">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">导入题目</h3>
            <div
              class="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
              @click="$refs.fileInput.click()"
              @dragover.prevent
              @drop.prevent="onDrop"
            >
              <input
                ref="fileInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                class="hidden"
                @change="onFileSelect"
              />
              <font-awesome-icon icon="upload" class="text-3xl text-gray-300 mb-2" />
              <p class="text-sm text-gray-500">点击或拖拽文件到此处上传</p>
              <p class="text-xs text-gray-400 mt-1">支持 .xlsx / .xls / .csv 格式</p>
              <button class="btn-outline text-sm !px-4 !py-1.5 mt-3" @click.stop="$refs.fileInput.click()">
                选择文件
              </button>
            </div>
            <div v-if="importFile" class="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <font-awesome-icon icon="file-export" class="text-green-500" />
              {{ importFile.name }}
              <button class="text-xs text-red-400 hover:text-red-600" @click="importFile = null; importResult = null">移除</button>
            </div>
            <button
              v-if="importFile"
              class="btn-primary text-sm !px-4 !py-1.5 mt-2 flex items-center gap-1"
              :disabled="importing"
              @click="doImport"
            >
              <div v-if="importing" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              <font-awesome-icon v-else icon="file-import" />
              {{ importing ? '导入中...' : '开始导入' }}
            </button>

            <!-- 导入结果 -->
            <div v-if="importResult" :class="['mt-3 p-3 rounded-lg text-sm', importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700']">
              {{ importResult.message }}
              <div v-if="importResult.errors && importResult.errors.length > 0" class="mt-2 text-xs">
                <p v-for="(e, i) in importResult.errors" :key="i">· {{ e }}</p>
              </div>
            </div>
          </div>

          <!-- 下载模板 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-gray-700">导入模板</h3>
                <p class="text-xs text-gray-400 mt-1">下载标准模板文件，按格式填写后上传</p>
              </div>
              <button class="btn-outline text-sm !px-3 !py-1.5 flex items-center gap-1" @click="downloadTemplate">
                <font-awesome-icon icon="download" />
                下载模板
              </button>
            </div>
          </div>

          <!-- 导出 -->
          <div class="card border border-gray-100">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">导出题目</h3>
            <div class="flex flex-wrap gap-3">
              <select v-model="exportSubject" class="input sm:w-36 text-sm">
                <option value="">全部科目</option>
                <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <select v-model="exportChapter" class="input sm:w-36 text-sm">
                <option value="">全部章节</option>
                <option v-for="c in exportChapters" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <select v-model="exportType" class="input sm:w-28 text-sm">
                <option value="">全部类型</option>
                <option value="单选">单选</option>
                <option value="多选">多选</option>
                <option value="判断">判断</option>
              </select>
            </div>
            <button class="btn-primary text-sm !px-4 !py-1.5 mt-3 flex items-center gap-1" @click="doExport">
              <font-awesome-icon icon="file-export" />
              导出 Excel
            </button>
          </div>
        </div>

        <!-- ========== 数据库管理 ========== -->
        <div v-if="activeTab === 'database'" class="space-y-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">数据库管理</h2>

          <!-- 创建备份 -->
          <div class="card border border-gray-100">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-gray-700">备份数据库</h3>
                <p class="text-xs text-gray-400 mt-1">创建数据库快照，用于数据恢复</p>
              </div>
              <button class="btn-primary text-sm !px-3 !py-1.5 flex items-center gap-1" :disabled="backingUp" @click="doBackup">
                <div v-if="backingUp" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                <font-awesome-icon v-else icon="database" />
                {{ backingUp ? '备份中...' : '创建备份' }}
              </button>
            </div>
          </div>

          <!-- 备份列表 -->
          <div class="card border border-gray-100">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">备份列表</h3>
            <div v-if="backupsLoading" class="text-sm text-gray-400 text-center py-4">加载中...</div>
            <div v-else-if="backups.length === 0" class="text-sm text-gray-400 text-center py-4">暂无备份</div>
            <div v-else class="space-y-2">
              <div v-for="b in backups" :key="b.name" class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p class="text-sm text-gray-700">{{ b.name }}</p>
                  <p class="text-xs text-gray-400">{{ formatFileSize(b.size) }} · {{ formatDateTime(b.created_at) }}</p>
                </div>
                <button class="text-primary-600 text-sm hover:text-primary-700 font-medium flex items-center gap-1" @click="confirmRestore(b.name)">
                  <font-awesome-icon icon="rotate-left" class="text-xs" />
                  恢复
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- ========== 通用模态框：题目表单 ========== -->
    <Teleport to="body">
      <div v-if="showQuestionModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="showQuestionModal = false">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">{{ editingQuestion ? '编辑题目' : '添加题目' }}</h3>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">科目</label>
                <select v-model="qForm.subject_id" class="input text-sm" @change="onQFormSubjectChange">
                  <option value="">请选择</option>
                  <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">章节</label>
                <select v-model="qForm.chapter_id" class="input text-sm">
                  <option value="">请选择</option>
                  <option v-for="c in qFormChapters" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">题型</label>
                <select v-model="qForm.type" class="input text-sm">
                  <option value="单选">单选</option>
                  <option value="多选">多选</option>
                  <option value="判断">判断</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">难度</label>
                <select v-model.number="qForm.difficulty" class="input text-sm">
                  <option :value="1">1</option>
                  <option :value="2">2</option>
                  <option :value="3">3</option>
                  <option :value="4">4</option>
                  <option :value="5">5</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">题目内容</label>
              <textarea v-model="qForm.content" class="input" rows="3"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">选项A</label>
                <input v-model="qForm.option_a" class="input text-sm" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">选项B</label>
                <input v-model="qForm.option_b" class="input text-sm" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">选项C</label>
                <input v-model="qForm.option_c" class="input text-sm" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">选项D</label>
                <input v-model="qForm.option_d" class="input text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">正确答案</label>
              <input v-model="qForm.answer" class="input text-sm" placeholder="如 A / AB / 正确" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">解析</label>
              <textarea v-model="qForm.analysis" class="input" rows="2"></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button class="btn-ghost text-sm !px-4 !py-1.5" @click="showQuestionModal = false">取消</button>
            <button class="btn-primary text-sm !px-4 !py-1.5" :disabled="qFormSaving" @click="saveQuestion">
              {{ qFormSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ========== 科目模态框 ========== -->
    <Teleport to="body">
      <div v-if="showSubjectModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="showSubjectModal = false">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">{{ editingSubject ? '编辑科目' : '新建科目' }}</h3>
          <div>
            <label class="block text-xs text-gray-500 mb-1">科目名称</label>
            <input v-model="subjectForm.name" class="input" />
          </div>
          <div class="mt-3">
            <label class="block text-xs text-gray-500 mb-1">描述</label>
            <input v-model="subjectForm.description" class="input" />
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button class="btn-ghost text-sm !px-4 !py-1.5" @click="showSubjectModal = false">取消</button>
            <button class="btn-primary text-sm !px-4 !py-1.5" @click="saveSubject">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ========== 章节模态框 ========== -->
    <Teleport to="body">
      <div v-if="showChapterModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="showChapterModal = false">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">{{ editingChapter ? '编辑章节' : '新建章节' }}</h3>
          <div>
            <label class="block text-xs text-gray-500 mb-1">所属科目</label>
            <select v-model="chapterForm.subject_id" class="input text-sm">
              <option value="">请选择</option>
              <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="mt-3">
            <label class="block text-xs text-gray-500 mb-1">章节名称</label>
            <input v-model="chapterForm.name" class="input" />
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button class="btn-ghost text-sm !px-4 !py-1.5" @click="showChapterModal = false">取消</button>
            <button class="btn-primary text-sm !px-4 !py-1.5" @click="saveChapter">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ========== 通用确认对话框 ========== -->
    <Teleport to="body">
      <div v-if="confirmDialog.show" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="confirmDialog.show = false">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <div class="flex items-center gap-3 mb-4">
            <font-awesome-icon icon="exclamation-triangle" class="text-3xl text-red-500" />
            <div>
              <h3 class="font-semibold text-gray-800">{{ confirmDialog.title }}</h3>
              <p class="text-sm text-gray-500 mt-0.5">{{ confirmDialog.message }}</p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost text-sm !px-4 !py-1.5" @click="confirmDialog.show = false">取消</button>
            <button class="btn-danger text-sm !px-4 !py-1.5" @click="confirmDialog.onConfirm(); confirmDialog.show = false">确认</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import API from '../api'

const tabs = [
  { key: 'questions', label: '题库管理', icon: 'list-check' },
  { key: 'data', label: '数据管理', icon: 'table' },
  { key: 'importexport', label: '导入导出', icon: 'file-export' },
  { key: 'database', label: '数据库管理', icon: 'database' },
]

const activeTab = ref('questions')

// ==================== 题库管理 ====================
const qLoading = ref(false)
const questions = ref([])
const qPage = ref(1)
const qPageSize = 20
const qTotal = ref(0)
const qTotalPages = ref(0)
const qSelectedIds = ref([])
const qSearch = ref('')
const qSearchTimer = ref(null)
const qSubjectFilter = ref('')
const qChapterFilter = ref('')
const qTypeFilter = ref('')

const subjects = ref([])
const chapters = ref([])
const allChapters = ref([])

const qIsAllSelected = computed(() => questions.value.length > 0 && qSelectedIds.value.length === questions.value.length)

const qVisiblePages = computed(() => {
  const pages = []
  const tp = qTotalPages.value
  const cp = qPage.value
  let start = Math.max(1, cp - 2)
  let end = Math.min(tp, cp + 2)
  if (end - start < 4) {
    if (start === 1) end = Math.min(tp, start + 4)
    else start = Math.max(1, end - 4)
  }
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

const filteredChapters = computed(() => {
  if (!qSubjectFilter.value) return allChapters.value
  return allChapters.value.filter(c => c.subject_id == qSubjectFilter.value)
})

// 题目表单
const showQuestionModal = ref(false)
const editingQuestion = ref(null)
const qFormSaving = ref(false)
const qForm = reactive({
  subject_id: '',
  chapter_id: '',
  type: '单选',
  content: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  answer: '',
  analysis: '',
  difficulty: 1,
})

const qFormChapters = computed(() => {
  if (!qForm.subject_id) return allChapters.value
  return allChapters.value.filter(c => c.subject_id == qForm.subject_id)
})

function onQFormSubjectChange() {
  qForm.chapter_id = ''
}

onMounted(async () => {
  try {
    const [subRes, chRes] = await Promise.all([
      API.getSubjects(),
      API.getChapters(),
    ])
    subjects.value = subRes.data || []
    allChapters.value = chRes.data || []
  } catch (e) { /* ignore */ }
  loadQuestions()
  loadDbInfo()
  loadBackups()
})

function onSearchInput() {
  clearTimeout(qSearchTimer.value)
  qSearchTimer.value = setTimeout(() => loadQuestions(), 400)
}

async function loadQuestions() {
  qLoading.value = true
  try {
    const params = {
      page: qPage.value,
      pageSize: qPageSize,
    }
    if (qSearch.value) params.keyword = qSearch.value
    if (qSubjectFilter.value) params.subject_id = qSubjectFilter.value
    if (qChapterFilter.value) params.chapter_id = qChapterFilter.value
    if (qTypeFilter.value) params.type = qTypeFilter.value
    const data = await API.getQuestions(params)
    questions.value = data.list || []
    qTotal.value = data.total || 0
    qTotalPages.value = data.totalPages || 0
    qSelectedIds.value = []
  } catch (e) {
    questions.value = []
  } finally {
    qLoading.value = false
  }
}

function qToggleSelect(id) {
  const idx = qSelectedIds.value.indexOf(id)
  if (idx >= 0) qSelectedIds.value.splice(idx, 1)
  else qSelectedIds.value.push(id)
}

function qToggleSelectAll() {
  if (qIsAllSelected.value) qSelectedIds.value = []
  else qSelectedIds.value = questions.value.map(i => i.id)
}

function qGoPage(p) {
  if (p < 1 || p > qTotalPages.value || p === qPage.value) return
  qPage.value = p
  loadQuestions()
}

function qTypeLabel(type) {
  const map = { '单选': '单选', '多选': '多选', '判断': '判断' }
  return map[type] || type
}

function qTypeClass(type) {
  const map = { '单选': 'tag-single', '多选': 'tag-multi', '判断': 'tag-judge' }
  return map[type] || ''
}

function openQuestionModal(q = null) {
  if (q) {
    editingQuestion.value = q
    qForm.subject_id = q.subject_id || ''
    qForm.chapter_id = q.chapter_id || ''
    qForm.type = q.type || '单选'
    qForm.content = q.content || ''
    qForm.option_a = q.option_a || ''
    qForm.option_b = q.option_b || ''
    qForm.option_c = q.option_c || ''
    qForm.option_d = q.option_d || ''
    qForm.answer = q.answer || ''
    qForm.analysis = q.analysis || ''
    qForm.difficulty = q.difficulty || 1
  } else {
    editingQuestion.value = null
    qForm.subject_id = ''
    qForm.chapter_id = ''
    qForm.type = '单选'
    qForm.content = ''
    qForm.option_a = ''
    qForm.option_b = ''
    qForm.option_c = ''
    qForm.option_d = ''
    qForm.answer = ''
    qForm.analysis = ''
    qForm.difficulty = 1
  }
  showQuestionModal.value = true
}

async function saveQuestion() {
  if (!qForm.subject_id || !qForm.content || !qForm.answer) {
    alert('请填写科目、题目内容和正确答案')
    return
  }
  qFormSaving.value = true
  try {
    const payload = { ...qForm }
    if (editingQuestion.value) {
      await API.updateQuestion(editingQuestion.value.id, payload)
    } else {
      await API.createQuestion(payload)
    }
    showQuestionModal.value = false
    loadQuestions()
  } catch (e) {
    alert('保存失败')
  } finally {
    qFormSaving.value = false
  }
}

async function deleteQuestion(id) {
  confirmDialog.title = '确认删除'
  confirmDialog.message = '确定要删除这道题目吗？此操作不可恢复。'
  confirmDialog.onConfirm = async () => {
    try {
      await API.deleteQuestion(id)
      loadQuestions()
    } catch (e) { alert('删除失败') }
  }
  confirmDialog.show = true
}

async function batchDeleteQuestions() {
  if (qSelectedIds.value.length === 0) return
  confirmDialog.title = '批量删除'
  confirmDialog.message = `确定要删除选中的 ${qSelectedIds.value.length} 道题目吗？此操作不可恢复。`
  confirmDialog.onConfirm = async () => {
    try {
      await API.batchDeleteQuestions(qSelectedIds.value)
      qSelectedIds.value = []
      loadQuestions()
    } catch (e) { alert('批量删除失败') }
  }
  confirmDialog.show = true
}

// ==================== 数据管理 ====================
const dbInfo = ref({ tables: {} })
const dbInfoLoading = ref(true)
const chapterSubjectFilter = ref('')

async function loadDbInfo() {
  dbInfoLoading.value = true
  try {
    const res = await API.getDatabaseInfo()
    dbInfo.value = res || { tables: {} }
  } catch (e) { dbInfo.value = { tables: {} } } finally {
    dbInfoLoading.value = false
  }
}

// 云端同步
const syncing = ref(false)
const syncSuccess = ref(false)
const syncStatusText = ref('')
const syncCount = ref(null)

async function syncToCloud() {
  syncing.value = true
  try {
    const res = await API.syncToCloud()
    syncSuccess.value = true
    syncStatusText.value = new Date().toLocaleString('zh-CN')
    syncCount.value = res.count
  } catch (e) {
    syncSuccess.value = false
    syncStatusText.value = '失败: ' + (e.response?.data?.message || e.message)
  } finally {
    syncing.value = false
  }
}

function confirmClearStudy() {
  confirmDialog.title = '清空学习数据'
  confirmDialog.message = '将清除所有学习记录、错题和收藏数据，不可恢复。确定继续吗？'
  confirmDialog.onConfirm = async () => {
    try {
      await API.clearStudyData()
      loadDbInfo()
    } catch (e) { alert('清空失败') }
  }
  confirmDialog.show = true
}

// 章节
async function loadChapters() {
  try {
    const params = {}
    if (chapterSubjectFilter.value) params.subject_id = chapterSubjectFilter.value
    const res = await API.getChapters(params)
    chapters.value = res.data || []
  } catch (e) { chapters.value = [] }
}

watch(chapterSubjectFilter, () => loadChapters())
watch(activeTab, (v) => { if (v === 'data') loadChapters() })

const showSubjectModal = ref(false)
const editingSubject = ref(null)
const subjectForm = reactive({ name: '', description: '' })

function openSubjectModal(s = null) {
  if (s) {
    editingSubject.value = s
    subjectForm.name = s.name || ''
    subjectForm.description = s.description || ''
  } else {
    editingSubject.value = null
    subjectForm.name = ''
    subjectForm.description = ''
  }
  showSubjectModal.value = true
}

async function saveSubject() {
  if (!subjectForm.name) { alert('请输入科目名称'); return }
  try {
    if (editingSubject.value) {
      await API.updateSubject(editingSubject.value.id, subjectForm)
    } else {
      await API.createSubject(subjectForm)
    }
    showSubjectModal.value = false
    const res = await API.getSubjects()
    subjects.value = res.data || []
  } catch (e) { alert('保存失败: ' + (e.response?.data?.message || e.message)) }
}

async function deleteSubject(id) {
  confirmDialog.title = '删除科目'
  confirmDialog.message = '删除科目会一并删除其下的章节和题目，确定继续吗？'
  confirmDialog.onConfirm = async () => {
    try {
      await API.deleteSubject(id)
      const res = await API.getSubjects()
      subjects.value = res.data || []
      loadDbInfo()
    } catch (e) { alert('删除失败') }
  }
  confirmDialog.show = true
}

// 章节模态框
const showChapterModal = ref(false)
const editingChapter = ref(null)
const chapterForm = reactive({ subject_id: '', name: '' })

function openChapterModal(c = null) {
  if (c) {
    editingChapter.value = c
    chapterForm.subject_id = c.subject_id || ''
    chapterForm.name = c.name || ''
  } else {
    editingChapter.value = null
    chapterForm.subject_id = ''
    chapterForm.name = ''
  }
  showChapterModal.value = true
}

async function saveChapter() {
  if (!chapterForm.subject_id || !chapterForm.name) { alert('请选择科目并填写章节名称'); return }
  try {
    if (editingChapter.value) {
      await API.updateChapter(editingChapter.value.id, chapterForm)
    } else {
      await API.createChapter(chapterForm)
    }
    showChapterModal.value = false
    const res = await API.getChapters()
    allChapters.value = res.data || []
    loadChapters()
  } catch (e) { alert('保存失败') }
}

async function deleteChapter(id) {
  confirmDialog.title = '删除章节'
  confirmDialog.message = '删除章节会一并删除其下的题目，确定继续吗？'
  confirmDialog.onConfirm = async () => {
    try {
      await API.deleteChapter(id)
      const res = await API.getChapters()
      allChapters.value = res.data || []
      loadChapters()
      loadDbInfo()
    } catch (e) { alert('删除失败') }
  }
  confirmDialog.show = true
}

// ==================== 导入导出 ====================
const importFile = ref(null)
const importing = ref(false)
const importResult = ref(null)
const fileInput = ref(null)
const exportSubject = ref('')
const exportChapter = ref('')
const exportType = ref('')

const exportChapters = computed(() => {
  if (!exportSubject.value) return allChapters.value
  return allChapters.value.filter(c => c.subject_id == exportSubject.value)
})

watch(exportSubject, () => { exportChapter.value = '' })

function onDrop(e) {
  const file = e.dataTransfer.files[0]
  if (file) { importFile.value = file; importResult.value = null }
}

function onFileSelect(e) {
  const file = e.target.files[0]
  if (file) { importFile.value = file; importResult.value = null }
}

async function doImport() {
  if (!importFile.value) return
  importing.value = true
  importResult.value = null
  try {
    const res = await API.importQuestions(importFile.value)
    importResult.value = { success: true, message: res.message || '导入成功', errors: res.errors }
    importFile.value = null
    loadQuestions()
    loadDbInfo()
  } catch (e) {
    importResult.value = {
      success: false,
      message: e.response?.data?.message || '导入失败',
      errors: e.response?.data?.errors || [],
    }
  } finally {
    importing.value = false
  }
}

function downloadTemplate() {
  // 生成一个简单的模板 CSV
  const headers = '科目,章节,题型,题目内容,选项A,选项B,选项C,选项D,答案,解析\n'
  const example = '计算机基础,操作系统,单选,以下哪个是操作系统？,Windows,Python,Excel,TCP/IP,A,操作系统是管理计算机硬件与软件资源的程序\n'
  const bom = '\uFEFF'
  const blob = new Blob([bom + headers + example], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '题库导入模板.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function doExport() {
  try {
    const params = {}
    if (exportSubject.value) params.subject_id = exportSubject.value
    if (exportChapter.value) params.chapter_id = exportChapter.value
    if (exportType.value) params.type = exportType.value
    const response = await API.exportQuestions(params)
    // response is a blob (axios interceptor might affect this)
    const blob = response instanceof Blob ? response : new Blob([response], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `题库导出_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('导出失败')
  }
}

// ==================== 数据库管理 ====================
const backingUp = ref(false)
const backups = ref([])
const backupsLoading = ref(true)

async function loadBackups() {
  backupsLoading.value = true
  try {
    const res = await API.getBackups()
    backups.value = res.data || []
  } catch (e) {
    backups.value = []
  } finally {
    backupsLoading.value = false
  }
}

async function doBackup() {
  backingUp.value = true
  try {
    await API.backupDatabase()
    loadBackups()
  } catch (e) {
    alert('备份失败')
  } finally {
    backingUp.value = false
  }
}

function confirmRestore(name) {
  confirmDialog.title = '恢复数据库'
  confirmDialog.message = `确定要恢复到备份 "${name}" 吗？当前数据将被替换，操作不可撤销！`
  confirmDialog.onConfirm = async () => {
    try {
      await API.restoreDatabase(name)
      alert('数据库已恢复，请刷新页面')
      window.location.reload()
    } catch (e) {
      alert('恢复失败')
    }
  }
  confirmDialog.show = true
}

// ==================== 通用确认对话框 ====================
const confirmDialog = reactive({
  show: false,
  title: '',
  message: '',
  onConfirm: () => {},
})

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function formatDateTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
</script>
