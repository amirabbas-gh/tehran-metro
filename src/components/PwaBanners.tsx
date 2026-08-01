import type { ReactElement } from "react";
import type { BeforeInstallPromptEvent } from "../types/pwa";
import type { InstallUi } from "../types/metro";

export type PwaBannersProps = {
  updateReady: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
  changelogLead: string | undefined;
  installPrompt: BeforeInstallPromptEvent | null;
  installUi: InstallUi;
  onInstall: () => void;
  onDismissInstall: () => void;
  onInstallLeavingEnd: () => void;
};

export default function PwaBanners({
  updateReady,
  onApplyUpdate,
  onDismissUpdate,
  changelogLead,
  installPrompt,
  installUi,
  onInstall,
  onDismissInstall,
  onInstallLeavingEnd,
}: PwaBannersProps): ReactElement | null {
  if (updateReady) {
    return (
      <div className="installBanner" role="dialog" aria-label="آپدیت اپلیکیشن">
        <img src="/icon-192.png" alt="" width="40" height="40" />
        <div className="installBannerText">
          <strong>نسخه جدید آماده است</strong>
          <span className="installDesc">
            {changelogLead ??
              "برای دریافت تغییرات جدید، اپ را به‌روزرسانی کنید"}
          </span>
          <span className="installShort">آپدیت جدید</span>
        </div>
        <button type="button" className="installBannerGo" onClick={onApplyUpdate}>
          آپدیت
        </button>
        <button
          type="button"
          className="installBannerClose"
          aria-label="بعداً"
          onClick={onDismissUpdate}
        >
          <span className="installLater">بعداً</span>
          <span className="installX" aria-hidden="true">
            ×
          </span>
        </button>
      </div>
    );
  }

  if (installPrompt && (installUi === "banner" || installUi === "leaving")) {
    return (
      <div
        className={`installBanner${installUi === "leaving" ? " isLeaving" : ""}`}
        role="dialog"
        aria-label="نصب اپلیکیشن"
        onAnimationEnd={() => {
          if (installUi === "leaving") onInstallLeavingEnd();
        }}
      >
        <img src="/icon-192.png" alt="" width="40" height="40" />
        <div className="installBannerText">
          <strong>مترو تهران</strong>
          <span className="installDesc">نصبش کن؛ آفلاین هم کار می‌کنه</span>
          <span className="installShort">نصب اپ روی گوشی</span>
        </div>
        <button type="button" className="installBannerGo" onClick={onInstall}>
          نصب
        </button>
        <button
          type="button"
          className="installBannerClose"
          aria-label="بستن"
          onClick={onDismissInstall}
        >
          <span className="installLater">بعداً</span>
          <span className="installX" aria-hidden="true">
            ×
          </span>
        </button>
      </div>
    );
  }

  return null;
}
