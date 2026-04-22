/**
 * ConfirmDialog 컴포넌트
 *
 * 비가역적 액션 수행 전 사용자 확인을 요청하는 모달 다이얼로그.
 * shadcn/ui Dialog 컴포넌트 기반으로 재구현.
 * 기존 Props 구조 완전 유지 (open, onConfirm, onCancel, title, message, confirmLabel, confirmVariant).
 *
 * 사용 예:
 * <ConfirmDialog
 *   open={open}
 *   title="승인 확인"
 *   message="파일을 복사합니다. 계속하시겠습니까?"
 *   onConfirm={handleConfirm}
 *   onCancel={() => setOpen(false)}
 * />
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 확인 버튼 색상: 'blue' = 기본 액션, 'red' = 위험/삭제 */
  confirmVariant?: 'blue' | 'red';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'blue',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    confirmVariant === 'red'
      ? 'app-btn app-btn--danger'
      : 'app-btn app-btn--primary';

  return (
    <Dialog
      open={open}
      // ESC 키 또는 오버레이 클릭 시 onCancel 호출
      onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}
    >
      <DialogContent
        className="max-w-md"
        // Dialog 기본 닫기 버튼 숨김 (DialogContent 내부 X 버튼이 있으나 여기서는 취소로 처리)
        onInteractOutside={onCancel}
        onEscapeKeyDown={onCancel}
      >
        <DialogHeader>
          <p className="app-eyebrow">Confirm</p>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="app-btn app-btn--secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmClass}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
