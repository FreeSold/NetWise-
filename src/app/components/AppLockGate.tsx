import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { common, lockScreen } from "../../copy";
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
          <Text style={styles.lockTitle}>{lockScreen.initializingTitle}</Text>
          <Text style={styles.lockSubtitle}>{lockScreen.initializingSubtitle}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!appUnlocked) {
    return (
      <SafeAreaView style={[styles.lockContainer, { paddingTop: 20 + androidTopInset }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>
            {hasPasscodeConfigured ? lockScreen.unlockTitle : lockScreen.firstRunTitle}
          </Text>
          <Text style={styles.lockSubtitle}>
            {hasPasscodeConfigured ? lockScreen.unlockSubtitle : lockScreen.firstRunSubtitle}
          </Text>
          <TextInput
            value={passcodeInput}
            onChangeText={onChangePasscode}
            style={styles.lockInput}
            placeholder={lockScreen.passcodePlaceholder}
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
              placeholder={lockScreen.passcodeConfirmPlaceholder}
              placeholderTextColor="#94a3b8"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
            />
          ) : null}
          {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
          <Pressable style={styles.lockPrimaryButton} onPress={onPasscodeSubmit}>
            <Text style={styles.lockPrimaryButtonText}>
              {securityBusy ? common.processing : hasPasscodeConfigured ? lockScreen.unlock : lockScreen.saveAndEnter}
            </Text>
          </Pressable>
          {hasPasscodeConfigured && biometricAvailable && biometricEnabled ? (
            <Pressable style={styles.lockSecondaryButton} onPress={onBiometricUnlock}>
              <Text style={styles.lockSecondaryButtonText}>{lockScreen.biometricUnlock}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}
