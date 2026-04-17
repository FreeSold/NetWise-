import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { styles } from "../AppStyles";

export type AppLockGateProps = {
  androidTopInset: number;
  securityReady: boolean;
  appUnlocked: boolean;
  hasPasscodeConfigured: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  securityBusy: boolean;
  passcodeInput: string;
  passcodeConfirmInput: string;
  unlockError: string | null;
  onChangePasscode: (text: string) => void;
  onChangePasscodeConfirm: (text: string) => void;
  onPasscodeSubmit: () => void;
  onBiometricUnlock: () => void;
};

/**
 * 安全未就绪时的占位，或口令 / 生物识别解锁界面。主界面应在 `securityReady && appUnlocked` 时再渲染。
 */
export function AppLockGate(props: AppLockGateProps) {
  const {
    androidTopInset,
    securityReady,
    appUnlocked,
    hasPasscodeConfigured,
    biometricAvailable,
    biometricEnabled,
    securityBusy,
    passcodeInput,
    passcodeConfirmInput,
    unlockError,
    onChangePasscode,
    onChangePasscodeConfirm,
    onPasscodeSubmit,
    onBiometricUnlock
  } = props;

  if (!securityReady) {
    return (
      <SafeAreaView style={[styles.lockContainer, { paddingTop: 20 + androidTopInset }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>NetWise 安全初始化中</Text>
          <Text style={styles.lockSubtitle}>正在准备本地加密密钥...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!appUnlocked) {
    return (
      <SafeAreaView style={[styles.lockContainer, { paddingTop: 20 + androidTopInset }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>{hasPasscodeConfigured ? "输入口令解锁" : "首次使用，先设置口令"}</Text>
          <Text style={styles.lockSubtitle}>
            {hasPasscodeConfigured ? "本地资产数据已加密，解锁后才会展示。" : "请设置 6 位数字口令，后续启动 App 时需要输入。"}
          </Text>
          <TextInput
            value={passcodeInput}
            onChangeText={onChangePasscode}
            style={styles.lockInput}
            placeholder="输入 6 位数字口令"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
          />
          {!hasPasscodeConfigured ? (
            <TextInput
              value={passcodeConfirmInput}
              onChangeText={onChangePasscodeConfirm}
              style={styles.lockInput}
              placeholder="再次输入口令"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
            />
          ) : null}
          {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
          <Pressable style={styles.lockPrimaryButton} onPress={onPasscodeSubmit}>
            <Text style={styles.lockPrimaryButtonText}>
              {securityBusy ? "处理中..." : hasPasscodeConfigured ? "解锁" : "保存并进入"}
            </Text>
          </Pressable>
          {hasPasscodeConfigured && biometricAvailable && biometricEnabled ? (
            <Pressable style={styles.lockSecondaryButton} onPress={onBiometricUnlock}>
              <Text style={styles.lockSecondaryButtonText}>使用生物识别解锁</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}
