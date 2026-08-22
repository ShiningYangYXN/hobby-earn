<script setup lang="ts">
import { NFlex, NIcon, NResult, NTag } from 'naive-ui'
import { IconMoodDollar, IconTag, IconCertificate, IconBrandGithub } from '@tabler/icons-vue'
import { version, license } from '@/../package.json'
</script>

<template>
  <NResult title="HobbyEarn" description="一起玩赚零花钱" size="huge">
    <template #icon>
      <NIcon size="256px">
        <IconMoodDollar />
      </NIcon>
    </template>
    <template #footer>
      <NFlex justify="center">
        <NTag :bordered="false" type="info">
          <NIcon>
            <IconTag />
          </NIcon>
          {{ version }}
        </NTag>
        <NTag :bordered="false" type="success">
          <NIcon>
            <IconCertificate />
          </NIcon>
          {{ license }}
        </NTag>
        <a href="https://github.com/ShiningYangYXN/hobby-earn">
          <NTag :bordered="false">
            <NIcon>
              <IconBrandGithub />
            </NIcon>
            ShiningYangYXN / <b>hobby-earn</b>
          </NTag>
        </a>
      </NFlex>
    </template>
  </NResult>
</template>
