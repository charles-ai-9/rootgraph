import {
  H1, H2, H3, Stack, Grid, Stat, Table, Text, Divider, Card, CardHeader, CardBody,
  Tag, Callout, Code, canvasImage
} from 'qoder/canvas';

const safariImg = canvasImage('/Users/charles/Library/Application Support/QoderCN/SharedClientCache/cache/images/task-db6/hppquonh-189accae.png');
const chromeImg = canvasImage('/Users/charles/Library/Application Support/QoderCN/SharedClientCache/cache/images/task-db6/54j6apt8-2c9e2bda.png');

export default function Report() {
  return (
    <Stack gap={24}>
      <H1>RootGraph 数据架构重构完成报告</H1>

      {/* 问题 */}
      <Card>
        <CardHeader>
          <H2>问题</H2>
        </CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Text>用户报告两个问题：</Text>
            <Text>1. 编辑单词释义后保存，刷新后数据丢失</Text>
            <Text>2. 不同浏览器看到的内容不一样</Text>
            <Divider />
            <H3>修复前：两个浏览器数据不一致</H3>
            <Grid columns={2} gap={16}>
              <Card>
                <CardBody>
                  <Text weight="bold">Safari</Text>
                  <img src={safariImg} alt="Safari 显示 TEST_DEFINITION_12345" style={{ width: '100%', borderRadius: 8 }} />
                  <Text tone="secondary" size="small">显示旧测试数据 TEST_DEFINITION_12345</Text>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <Text weight="bold">Chrome</Text>
                  <img src={chromeImg} alt="Chrome 显示原始释义" style={{ width: '100%', borderRadius: 8 }} />
                  <Text tone="secondary" size="small">显示原始释义（数据未同步）</Text>
                </CardBody>
              </Card>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      {/* 根因分析 */}
      <Card>
        <CardHeader>
          <H2>根因分析</H2>
        </CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Callout tone="danger">
              <Text>旧架构是 <Code>localStorage-first + async sync</Code>，每个浏览器有独立的 localStorage 副本，复杂的同步机制产生多层竞态。</Text>
            </Callout>
            <Table
              headers={['机制', '问题']}
              rows={[
                ['mergingRef + editCountRef', '多层标记防竞态，仍然防不住 React 18 并发模式'],
                ['mergeRemote (90行)', 'touchMap 逐条合并逻辑复杂，易出错'],
                ['scheduleUpload (500ms debounce)', '防抖延迟导致数据不同步'],
                ['sendBeacon / flushUpload', '到达时间不确定，与新页面 GET 产生竞态'],
                ['409 force-pull 循环', 'merge → upload → 409 → force-pull → merge 无限循环'],
                ['IndexedDB 快照', '本地兜底机制，掩盖了架构缺陷'],
                ['跨标签页 storage 合并', '追加型合并逻辑复杂，容易丢数据'],
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

      {/* 修复方案 */}
      <Card>
        <CardHeader>
          <H2>修复方案：服务端 (D1) 权威模型</H2>
        </CardHeader>
        <CardBody>
          <Stack gap={16}>
            <Callout tone="success">
              <Text><Code>D1</Code> 是唯一数据源，<Code>localStorage</Code> 降级为纯缓存。</Text>
            </Callout>
            <Grid columns={2} gap={16}>
              <Card>
                <CardHeader><H3>加载流程</H3></CardHeader>
                <CardBody>
                  <Code>GET /api/db/sync</Code>
                  <Text>→ 服务器数据覆盖本地</Text>
                  <Text size="small" tone="secondary">仅当 server.updatedAt &gt; local.updatedAt</Text>
                </CardBody>
              </Card>
              <Card>
                <CardHeader><H3>保存流程</H3></CardHeader>
                <CardBody>
                  <Code>userEdit → setStore → useEffect</Code>
                  <Text>→ <Code>saveToServer</Code> PUT → D1 写入</Text>
                  <Text size="small" tone="secondary">fire-and-forget，不阻塞用户操作</Text>
                </CardBody>
              </Card>
            </Grid>
            <Divider />
            <H3>关键修复</H3>
            <Table
              headers={['修复', '说明']}
              rows={[
                ['isUserEditRef', '区分用户编辑 vs 服务器加载，只上传用户编辑'],
                ['saveToServer 移到 useEffect', '不在 setState updater 内执行 side effect'],
                ['beforeunload 处理器', '确保 localStorage 始终有最新数据'],
                ['删除 ~395 行代码', '移除所有同步机制'],
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

      {/* 改动文件 */}
      <Card>
        <CardHeader>
          <H2>改动文件</H2>
        </CardHeader>
        <CardBody>
          <Table
            headers={['文件', '变化']}
            rows={[
              ['src/utils/sync.ts', '118行 → 62行，仅保留 getDeviceId / saveToServer / downloadRemote'],
              ['src/hooks/useNotes.ts', '删除 ~300 行同步逻辑'],
              ['src/utils/snapshotDb.ts', '删除（服务端权威下不需要）'],
              ['public/sw.js', 'v50 → v52'],
            ]}
          />
        </CardBody>
      </Card>

      {/* 验证结果 */}
      <Card>
        <CardHeader>
          <H2>验证结果</H2>
        </CardHeader>
        <CardBody>
          <Grid columns={2} gap={16}>
            <Stat value="✅" label="编辑 → 保存 → 第1次硬刷新" tone="success" />
            <Stat value="✅" label="第2次硬刷新 → 数据仍在" tone="success" />
            <Stat value="✅" label="云端：378 wordFields, tie=YES" tone="success" />
            <Stat value="✅" label="两个浏览器数据一致" tone="success" />
          </Grid>
        </CardBody>
      </Card>

      {/* Git Commits */}
      <Card>
        <CardHeader>
          <H2>Git Commits</H2>
        </CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text><Code>66a4eac</Code> — refactor: 简化数据架构为服务端权威模型</Text>
            <Text><Code>2baf41a</Code> — fix: 修复编辑保存后刷新丢失</Text>
          </Stack>
        </CardBody>
      </Card>

      <Text tone="secondary" size="small">
        生成时间：2026-08-26 | RootGraph 数据架构重构
      </Text>
    </Stack>
  );
}
